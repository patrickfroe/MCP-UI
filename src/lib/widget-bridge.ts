export type WidgetBridgeAction =
  | { kind: "resource.read"; resourceUri: string }
  | { kind: "tool.call"; toolName: string; args: Record<string, unknown> };

export function parseWidgetBridgeMessage(message: unknown): WidgetBridgeAction | null {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return null;
  }

  const typed = message as { type?: unknown; resourceUri?: unknown; toolName?: unknown; args?: unknown };
  if (typed.type === "resource.read" && typeof typed.resourceUri === "string" && typed.resourceUri.trim()) {
    return { kind: "resource.read", resourceUri: typed.resourceUri };
  }

  if (typed.type === "tool.call" && typeof typed.toolName === "string" && typed.toolName.trim()) {
    return {
      kind: "tool.call",
      toolName: typed.toolName,
      args: typed.args && typeof typed.args === "object" ? typed.args as Record<string, unknown> : {},
    };
  }

  return null;
}
