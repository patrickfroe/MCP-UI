import { buildInitialArgs, buildInputSummary } from "@/lib/tool-execution";
import type { MCPToolDescriptor } from "@/lib/types";

export interface RunHistoryItem {
  id: string;
  toolName: string;
  timestamp: string;
  status: "success" | "error";
  inputSummary: string;
  args: Record<string, unknown>;
}

export function filterTools(tools: MCPToolDescriptor[], search: string): MCPToolDescriptor[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return tools;
  }

  return tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(needle) ||
      (tool.title ?? "").toLowerCase().includes(needle) ||
      (tool.description ?? "").toLowerCase().includes(needle),
  );
}

export function getNextSelectionState(tools: MCPToolDescriptor[], toolName: string | null) {
  const selectedTool = toolName ? tools.find((tool) => tool.name === toolName) ?? null : null;

  if (!selectedTool) {
    return {
      selectedToolName: null,
      args: {},
    };
  }

  return {
    selectedToolName: selectedTool.name,
    args: buildInitialArgs(selectedTool),
  };
}

export function createRunHistoryItem(params: {
  id: string;
  toolName: string;
  status: "success" | "error";
  timestamp?: string;
  args: Record<string, unknown>;
}): RunHistoryItem {
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
  if (result === null || result === undefined) {
    return {
      pretty: "No result data returned.",
      raw: "null",
    };
  }

  if (typeof result === "string") {
    return {
      pretty: result,
      raw: JSON.stringify(result),
    };
  }

  try {
    return {
      pretty: JSON.stringify(result, null, 2),
      raw: JSON.stringify(result),
    };
  } catch {
    const fallback = String(result);
    return {
      pretty: fallback,
      raw: fallback,
    };
  }
}
