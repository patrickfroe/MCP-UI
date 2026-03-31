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

export function buildConnectionConfig(transport: MCPTransportType, httpUrl: string, stdio: StdioFormState): MCPServerConfig {
  if (transport === "stdio") {
    return {
      type: "stdio",
      command: stdio.command,
      args: stdio.argsText.trim() ? stdio.argsText.split(" ").filter(Boolean) : [],
      cwd: stdio.cwd.trim() || undefined,
      env: stdio.envText.trim() ? parseEnvText(stdio.envText) : undefined,
    };
  }
  return { type: "streamable-http", url: httpUrl };
}

export function validateConnectionConfig(config: MCPServerConfig): string | null {
  if (config.type === "streamable-http") {
    return config.url.trim() ? null : "No server configured. Enter a streamable HTTP MCP URL before connecting.";
  }
  return config.command.trim() ? null : "Command is required for local STDIO transport.";
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
