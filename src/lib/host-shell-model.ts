import { buildInitialArgs, buildInputSummary } from "@/lib/tool-execution";
import type { MCPServerConfig, MCPToolDescriptor, MCPTransportType } from "@/lib/types";

export interface RunHistoryItem {
  id: string;
  toolName: string;
  timestamp: string;
  status: "success" | "error";
  inputSummary: string;
  args: Record<string, unknown>;
}

export interface StdioFormState {
  command: string;
  argsText: string;
  cwd: string;
  envText: string;
}

export interface HttpFormState {
  headersText: string;
  authToken: string;
  requestTimeoutMsText: string;
}

export function getTransportLabel(transport: MCPTransportType): string {
  return transport === "stdio" ? "Local STDIO" : "Streamable HTTP";
}

export function parseEnvText(envText: string): Record<string, string> {
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return idx < 0 ? [line, ""] : [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

export function parseHeadersText(headersText: string): Record<string, string> {
  return Object.fromEntries(
    headersText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(":");
        return idx < 0 ? [line, ""] : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
      .filter(([key]) => Boolean(key)),
  );
}

function parseOptionalPositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number.NaN;
}

export function buildConnectionConfig(
  transport: MCPTransportType,
  httpUrl: string,
  stdio: StdioFormState,
  http: HttpFormState,
): MCPServerConfig {
  if (transport === "stdio") {
    return {
      type: "stdio",
      command: stdio.command,
      args: stdio.argsText.trim() ? stdio.argsText.split(" ").filter(Boolean) : [],
      cwd: stdio.cwd.trim() || undefined,
      env: stdio.envText.trim() ? parseEnvText(stdio.envText) : undefined,
    };
  }

  const parsedTimeout = parseOptionalPositiveNumber(http.requestTimeoutMsText);

  return {
    type: "streamable-http",
    url: httpUrl,
    headers: http.headersText.trim() ? parseHeadersText(http.headersText) : undefined,
    authToken: http.authToken.trim() || undefined,
    requestTimeoutMs: Number.isNaN(parsedTimeout) ? undefined : parsedTimeout,
  };
}

export function validateConnectionConfig(config: MCPServerConfig): string | null {
  if (config.type === "streamable-http") {
    const url = config.url.trim();
    if (!url) {
      return "No server configured. Enter a streamable HTTP MCP URL before connecting.";
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "MCP server URL must start with http:// or https://.";
      }
    } catch {
      return "Enter a valid streamable HTTP URL (example: http://localhost:3001/mcp).";
    }

    if (config.requestTimeoutMs !== undefined && (!Number.isFinite(config.requestTimeoutMs) || config.requestTimeoutMs <= 0)) {
      return "HTTP request timeout must be a positive number of milliseconds.";
    }

    if (config.headers && Object.entries(config.headers).some(([key, value]) => !key.trim() || typeof value !== "string")) {
      return "HTTP headers must be in Header: value format with non-empty header names.";
    }

    return null;
  }
  return config.command.trim() ? null : "Command is required for local STDIO transport.";
}

export function getConnectionStatusMessage(status: "disconnected" | "connecting" | "connected" | "error", transport: MCPTransportType): string {
  const transportLabel = getTransportLabel(transport);
  if (status === "connected") return `Connected via ${transportLabel}. Tools are ready to run.`;
  if (status === "connecting") return `Connecting via ${transportLabel}…`;
  if (status === "error") return `Connection failed (${transportLabel}). Check settings and diagnostics.`;
  return "No active connection. Configure a transport and connect to load tools.";
}

export function filterTools(tools: MCPToolDescriptor[], search: string): MCPToolDescriptor[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return tools;
  return tools.filter((tool) => tool.name.toLowerCase().includes(needle) || (tool.title ?? "").toLowerCase().includes(needle) || (tool.description ?? "").toLowerCase().includes(needle));
}

export function getNextSelectionState(tools: MCPToolDescriptor[], toolName: string | null) {
  const selectedTool = toolName ? tools.find((tool) => tool.name === toolName) ?? null : null;
  if (!selectedTool) return { selectedToolName: null, args: {} };
  return { selectedToolName: selectedTool.name, args: buildInitialArgs(selectedTool) };
}

export function createRunHistoryItem(params: { id: string; toolName: string; status: "success" | "error"; timestamp?: string; args: Record<string, unknown> }): RunHistoryItem {
  return {
    id: params.id,
    toolName: params.toolName,
    timestamp: params.timestamp ?? new Date().toISOString(),
    status: params.status,
    inputSummary: buildInputSummary(params.args),
    args: params.args,
  };
}

export function serializeFallbackResult(result: unknown): { pretty: string; raw: string } {
  if (result === null || result === undefined) return { pretty: "No result data returned.", raw: "null" };
  if (typeof result === "string") return { pretty: result, raw: JSON.stringify(result) };
  try {
    return { pretty: JSON.stringify(result, null, 2), raw: JSON.stringify(result) };
  } catch {
    const fallback = String(result);
    return { pretty: fallback, raw: fallback };
  }
}
