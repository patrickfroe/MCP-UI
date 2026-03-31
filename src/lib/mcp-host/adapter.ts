import { spawn, type ChildProcess } from "node:child_process";
import { MCPAdapterError } from "@/lib/mcp-host/errors";
import { MCPStreamableHttpTransport } from "@/lib/mcp-host/json-rpc";
import { normalizeResource, normalizeToolRun, normalizeTools } from "@/lib/mcp-host/normalizers";
import type {
  MCPConnectionStatus,
  MCPHostAdapter,
  MCPResourceContents,
  MCPServerConfig,
  MCPServerConnection,
  MCPToolDescriptor,
  MCPToolRun,
} from "@/lib/types";

interface InitializeResult {
  serverInfo?: { name?: string; version?: string; instructions?: string };
}

interface StdioConfigValidationResult {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
}

function validateStdioConfig(config: Extract<MCPServerConfig, { type: "stdio" }>): StdioConfigValidationResult {
  const command = config.command?.trim() ?? "";
  if (!command) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: command is required.");
  }

  if (Array.isArray(config.args) && config.args.some((arg) => typeof arg !== "string")) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: args must be an array of strings.");
  }
  const args = (config.args ?? []).map((arg) => arg.trim()).filter(Boolean);

  if (config.cwd !== undefined && !config.cwd.trim()) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: cwd cannot be empty when provided.");
  }

  if (config.env && Object.entries(config.env).some(([k, v]) => !k.trim() || typeof v !== "string")) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: env keys must be non-empty and values must be strings.");
  }

  const startupTimeoutMs = config.startupTimeoutMs ?? 7_000;
  if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs <= 0) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: startupTimeoutMs must be a positive number.");
  }

  const requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new MCPAdapterError("BAD_REQUEST", "Invalid stdio config: requestTimeoutMs must be a positive number.");
  }

  return {
    command,
    args,
    cwd: config.cwd?.trim() || undefined,
    env: config.env,
    startupTimeoutMs,
    requestTimeoutMs,
  };
}

class HttpHostAdapter implements MCPHostAdapter {
  private connection: MCPServerConnection = {
    id: "single-server",
    name: "Configured MCP Server",
    transport: "streamable-http",
    baseUrl: "http://localhost:3001/mcp",
    status: "disconnected",
  };

  private transport: MCPStreamableHttpTransport | null = null;
  private runs: MCPToolRun[] = [];

  private setStatus(status: MCPConnectionStatus, lastError?: MCPServerConnection["lastError"]) {
    this.connection = { ...this.connection, status, lastError };
  }

  async connect(config: MCPServerConfig): Promise<MCPServerConnection> {
    if (config.type !== "streamable-http") {
      throw new MCPAdapterError("BAD_REQUEST", "HTTP adapter requires streamable-http config");
    }

    const normalizedUrl = config.url.trim();
    if (!normalizedUrl) {
      throw new MCPAdapterError("BAD_REQUEST", "url is required");
    }

    this.connection = {
      ...this.connection,
      transport: "streamable-http",
      name: config.name?.trim() || "Configured MCP Server",
      baseUrl: normalizedUrl,
      connectedAt: undefined,
      serverInfo: undefined,
      raw: undefined,
      process: undefined,
    };
    this.setStatus("connecting");
    this.transport = new MCPStreamableHttpTransport(normalizedUrl, {
      headers: config.headers,
      authToken: config.authToken,
      requestTimeoutMs: config.requestTimeoutMs,
    });

    try {
      const initializeResult = await this.transport.request<InitializeResult>("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "mcp-ui-host-mvp", version: "0.1.0" },
      });
      this.connection = {
        ...this.connection,
        status: "connected",
        connectedAt: new Date().toISOString(),
        serverInfo: initializeResult.serverInfo,
        raw: initializeResult,
      };
      return this.connection;
    } catch (error) {
      const mapped = error instanceof MCPAdapterError
        ? error
        : new MCPAdapterError("CONNECTION_FAILED", "MCP connect failed", error);
      this.setStatus("error", {
        code: mapped.code,
        message: mapped.message,
        details: { url: normalizedUrl },
      });
      throw mapped.code === "CONNECTION_FAILED"
        ? new MCPAdapterError("CONNECTION_FAILED", `Failed to connect to MCP server at ${normalizedUrl}`, error)
        : mapped;
    }
  }

  status() {
    return this.connection;
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    const transport = this.requireTransport();
    const result = await transport.request<{ tools?: unknown[] }>("tools/list", {});
    return normalizeTools(result.tools);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolRun> {
    if (!toolName.trim()) {
      throw new MCPAdapterError("BAD_REQUEST", "toolName is required");
    }
    const transport = this.requireTransport();
    try {
      const result = await transport.request<unknown>("tools/call", { name: toolName, arguments: args });
      const run = normalizeToolRun(toolName, args, result);
      this.runs.unshift(run);
      return run;
    } catch (error) {
      throw new MCPAdapterError("TOOL_CALL_FAILED", `Tool call failed for ${toolName}`, error);
    }
  }

  async readResource(resourceUri: string): Promise<MCPResourceContents> {
    if (!resourceUri.trim()) {
      throw new MCPAdapterError("BAD_REQUEST", "resourceUri is required");
    }
    const transport = this.requireTransport();
    try {
      const result = await transport.request<unknown>("resources/read", { uri: resourceUri });
      return normalizeResource(resourceUri, result);
    } catch (error) {
      throw new MCPAdapterError("RESOURCE_READ_FAILED", `Failed to read resource ${resourceUri}`, error);
    }
  }

  async disconnect(): Promise<MCPServerConnection> {
    this.transport = null;
    this.connection = { ...this.connection, status: "disconnected", connectedAt: undefined };
    return this.connection;
  }

  private requireTransport() {
    if (!this.transport || this.connection.status !== "connected") {
      throw new MCPAdapterError("NOT_CONNECTED", "Host is not connected to an MCP server");
    }
    return this.transport;
  }
}

class StdioSession {
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer?: NodeJS.Timeout }>();
  private buffer = "";
  private process: ChildProcess | null = null;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  private stderrTail: string[] = [];
  private readonly maxStderrLines = 40;
  private readonly validatedConfig: StdioConfigValidationResult;
  private malformedResponseCount = 0;
  private requestIndex = 0;

  constructor(
    private readonly config: Extract<MCPServerConfig, { type: "stdio" }>,
    private readonly onTerminated: (error: MCPAdapterError) => void,
  ) {
    this.validatedConfig = validateStdioConfig(config);
  }

  async start(): Promise<{ serverInfo?: InitializeResult["serverInfo"]; pid?: number }> {
    const child = spawn(this.validatedConfig.command, this.validatedConfig.args, {
      cwd: this.validatedConfig.cwd,
      env: this.buildEnv() as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    this.process = child;

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      this.stderrTail.push(...lines);
      if (this.stderrTail.length > this.maxStderrLines) {
        this.stderrTail = this.stderrTail.slice(-this.maxStderrLines);
      }
    });

    child.stdout?.on("data", (chunk: Buffer | string) => this.consume(String(chunk)));
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.exitInfo = { code, signal };
      const error = new MCPAdapterError("PROCESS_EXITED", "STDIO process exited unexpectedly.", {
        code,
        signal,
        stderrTail: this.stderrTail,
      });
      for (const [id, pending] of this.pending) {
        pending.reject(new MCPAdapterError("PROCESS_EXITED", "STDIO process exited unexpectedly.", { id, code, signal, stderrTail: this.stderrTail }));
      }
      this.pending.clear();
      this.onTerminated(error);
    });
    child.on("error", (error: Error) => {
      const mapped = new MCPAdapterError("PROCESS_START_FAILED", `Unable to launch stdio command "${this.validatedConfig.command}": ${error.message}`, {
        command: this.validatedConfig.command,
        args: this.validatedConfig.args,
        stderrTail: this.stderrTail,
      });
      for (const [, pending] of this.pending) {
        pending.reject(mapped);
      }
      this.pending.clear();
      this.onTerminated(mapped);
    });

    const startupTimeoutMs = this.validatedConfig.startupTimeoutMs;
    const init = await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mcp-ui-host-mvp", version: "0.1.0" },
    }, startupTimeoutMs, "STARTUP_TIMEOUT") as InitializeResult;

    return { serverInfo: init.serverInfo, pid: child.pid };
  }

  async request(method: string, params: Record<string, unknown>, timeoutMs?: number, timeoutCode: "REQUEST_TIMEOUT" | "STARTUP_TIMEOUT" = "REQUEST_TIMEOUT") {
    const child = this.ensureRunning();
    const id = `stdio-${this.requestIndex++}`;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const frame = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;

    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new MCPAdapterError(timeoutCode, `${method} timed out`, { timeoutMs: timeoutMs ?? this.validatedConfig.requestTimeoutMs }));
      }, timeoutMs ?? this.validatedConfig.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    if (!child.stdin) { throw new MCPAdapterError("PROCESS_EXITED", "STDIO stdin is unavailable"); }
    child.stdin.write(frame, (error) => {
      if (!error) return;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new MCPAdapterError("PROCESS_EXITED", `Failed to write ${method} request to stdio process.`, {
        method,
        error: error.message,
        stderrTail: this.stderrTail,
      }));
    });
    return promise;
  }

  async stop() {
    if (!this.process) {
      return;
    }
    const child = this.process;
    this.process = null;
    if (!child.killed) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
          resolve();
        }, 1000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  diagnostics() {
    return {
      pid: this.process?.pid,
      command: this.validatedConfig.command,
      args: this.validatedConfig.args,
      envKeys: Object.keys(this.validatedConfig.env ?? {}),
      exited: Boolean(this.exitInfo),
      exitCode: this.exitInfo?.code ?? null,
      signal: this.exitInfo?.signal ?? null,
      stderrTail: [...this.stderrTail],
      malformedResponseCount: this.malformedResponseCount,
    };
  }

  private buildEnv() {
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string" && (k === "PATH" || k === "HOME" || k === "SYSTEMROOT" || k.startsWith("LC_"))) {
        base[k] = v;
      }
    }
    return { ...base, ...(this.validatedConfig.env ?? {}) };
  }

  private ensureRunning() {
    if (!this.process) {
      throw new MCPAdapterError("NOT_CONNECTED", "No active stdio process");
    }
    return this.process;
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = "";
        return;
      }
      const length = Number(match[1]);
      const total = headerEnd + 4 + length;
      if (this.buffer.length < total) return;
      const body = this.buffer.slice(headerEnd + 4, total);
      this.buffer = this.buffer.slice(total);
      this.handleMessage(body);
    }
  }

  private handleMessage(body: string) {
    try {
      const payload = JSON.parse(body) as { id?: string; result?: unknown; error?: { message?: string; code?: number; data?: unknown } };
      if (!payload.id) {
        return;
      }
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (payload.error) {
        pending.reject(new MCPAdapterError("MCP_PROTOCOL_ERROR", payload.error.message ?? "MCP error", {
          rpcCode: payload.error.code,
          rpcData: payload.error.data,
        }));
        return;
      }
      pending.resolve(payload.result);
    } catch {
      this.malformedResponseCount += 1;
      const error = new MCPAdapterError("MCP_PROTOCOL_ERROR", "Malformed JSON-RPC response from stdio server.", {
        malformedResponseCount: this.malformedResponseCount,
        stderrTail: this.stderrTail,
      });
      for (const [, pending] of this.pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
    }
  }
}

class StdioHostAdapter implements MCPHostAdapter {
  private connection: MCPServerConnection = {
    id: "single-server",
    name: "Local STDIO MCP Server",
    transport: "stdio",
    status: "disconnected",
  };
  private session: StdioSession | null = null;
  private runs: MCPToolRun[] = [];
  private activeSessionToken = 0;
  private buildSessionTerminatedError(session: StdioSession, error: MCPAdapterError) {
    if (this.session !== session) return;
    this.connection = {
      ...this.connection,
      status: "error",
      lastError: error.toJSON(),
      process: session.diagnostics(),
    };
  }

  async connect(config: MCPServerConfig): Promise<MCPServerConnection> {
    if (config.type !== "stdio") {
      throw new MCPAdapterError("BAD_REQUEST", "STDIO adapter requires stdio config");
    }
    await this.disconnect();

    this.connection = {
      ...this.connection,
      transport: "stdio",
      name: config.name?.trim() || "Local STDIO MCP Server",
      status: "connecting",
      connectedAt: undefined,
      serverInfo: undefined,
      raw: undefined,
      process: undefined,
    };

    const token = ++this.activeSessionToken;
    const session = new StdioSession(config, (error) => {
      if (token !== this.activeSessionToken) return;
      this.buildSessionTerminatedError(session, error);
    });
    this.session = session;

    try {
      const init = await session.start();
      this.connection = {
        ...this.connection,
        status: "connected",
        connectedAt: new Date().toISOString(),
        serverInfo: init.serverInfo,
        raw: init,
        process: session.diagnostics(),
      };
      return this.connection;
    } catch (error) {
      const mapped = error instanceof MCPAdapterError
        ? error
        : new MCPAdapterError("CONNECTION_FAILED", "Failed to connect stdio server.", error);
      this.connection = {
        ...this.connection,
        status: "error",
        lastError: mapped.toJSON(),
        process: session.diagnostics(),
      };
      await session.stop();
      this.session = null;
      throw mapped;
    }
  }

  status() {
    return { ...this.connection, process: this.session?.diagnostics() ?? this.connection.process };
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    const session = this.requireSession();
    const result = await session.request("tools/list", {} as Record<string, unknown>) as { tools?: unknown[] };
    return normalizeTools(result.tools);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolRun> {
    const session = this.requireSession();
    try {
      const result = await session.request("tools/call", { name: toolName, arguments: args });
      const run = normalizeToolRun(toolName, args, result);
      this.runs.unshift(run);
      return run;
    } catch (error) {
      throw new MCPAdapterError("TOOL_CALL_FAILED", `Tool call failed for ${toolName}`, error);
    }
  }

  async readResource(resourceUri: string): Promise<MCPResourceContents> {
    const session = this.requireSession();
    try {
      const result = await session.request("resources/read", { uri: resourceUri });
      return normalizeResource(resourceUri, result);
    } catch (error) {
      throw new MCPAdapterError("RESOURCE_READ_FAILED", `Failed to read resource ${resourceUri}`, error);
    }
  }

  async disconnect(): Promise<MCPServerConnection> {
    this.activeSessionToken += 1;
    if (this.session) {
      await this.session.stop();
      this.session = null;
    }
    this.connection = { ...this.connection, status: "disconnected", connectedAt: undefined, process: undefined };
    return this.connection;
  }

  private requireSession() {
    if (!this.session || this.connection.status !== "connected") {
      throw new MCPAdapterError("NOT_CONNECTED", "Host is not connected to an MCP server");
    }
    return this.session;
  }
}

export function createTransportAdapter(config: MCPServerConfig): MCPHostAdapter {
  return config.type === "stdio" ? new StdioHostAdapter() : new HttpHostAdapter();
}

export class MCPHostRuntime implements MCPHostAdapter {
  private adapter: MCPHostAdapter = new HttpHostAdapter();
  private lastConfig: MCPServerConfig = { type: "streamable-http", url: "http://localhost:3001/mcp" };

  async connect(config: MCPServerConfig): Promise<MCPServerConnection> {
    await this.adapter.disconnect();
    this.adapter = createTransportAdapter(config);
    this.lastConfig = config;
    return this.adapter.connect(config);
  }

  status() {
    return this.adapter.status();
  }

  listTools() {
    return this.adapter.listTools();
  }

  callTool(toolName: string, args: Record<string, unknown>) {
    return this.adapter.callTool(toolName, args);
  }

  readResource(resourceUri: string) {
    return this.adapter.readResource(resourceUri);
  }

  disconnect() {
    return this.adapter.disconnect();
  }

  getLastConfig() {
    return this.lastConfig;
  }
}

export const mcpHostAdapter = new MCPHostRuntime();
