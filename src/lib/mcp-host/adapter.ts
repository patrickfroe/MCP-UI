import { MCPAdapterError } from "@/lib/mcp-host/errors";
import { MCPStreamableHttpTransport } from "@/lib/mcp-host/json-rpc";
import { normalizeResource, normalizeToolRun, normalizeTools } from "@/lib/mcp-host/normalizers";
import type {
  MCPConnectionStatus,
  MCPResourceContents,
  MCPServerConnection,
  MCPToolDescriptor,
  MCPToolRun,
} from "@/lib/types";

interface InitializeResult {
  serverInfo?: {
    name?: string;
    version?: string;
    instructions?: string;
  };
}

export class MCPHostAdapter {
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
    this.connection = {
      ...this.connection,
      status,
      lastError,
    };
  }

  async connect(baseUrl: string): Promise<MCPServerConnection> {
    const normalizedUrl = baseUrl.trim();
    if (!normalizedUrl) {
      throw new MCPAdapterError("BAD_REQUEST", "baseUrl is required");
    }

    this.connection = {
      ...this.connection,
      baseUrl: normalizedUrl,
      connectedAt: undefined,
      serverInfo: undefined,
      raw: undefined,
    };
    this.setStatus("connecting");

    this.transport = new MCPStreamableHttpTransport(normalizedUrl);

    try {
      const initializeResult = await this.transport.request<InitializeResult>("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "mcp-ui-host-mvp",
          version: "0.1.0",
        },
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
      this.setStatus("error", {
        code: "CONNECTION_FAILED",
        message: error instanceof Error ? error.message : "MCP connect failed",
        details: { baseUrl: normalizedUrl },
      });
      throw new MCPAdapterError(
        "CONNECTION_FAILED",
        `Failed to connect to MCP server at ${normalizedUrl}`,
        error,
      );
    }
  }

  status(): MCPServerConnection {
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
      const result = await transport.request<unknown>("tools/call", {
        name: toolName,
        arguments: args,
      });
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

  listRuns(): MCPToolRun[] {
    return this.runs;
  }

  private requireTransport(): MCPStreamableHttpTransport {
    if (!this.transport || this.connection.status !== "connected") {
      throw new MCPAdapterError("NOT_CONNECTED", "Host is not connected to an MCP server");
    }

    return this.transport;
  }
}

export const mcpHostAdapter = new MCPHostAdapter();
