import { parseWidgetBridgeMessage } from "@/lib/widget-bridge";
import type { MCPResourceContents } from "@/lib/types";

export interface WidgetHostCallbacks {
  onReadResource: (resourceUri: string) => Promise<MCPResourceContents>;
  onCallTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  onBridgeEvent?: (event: string) => void;
  onBridgeError?: (message: string) => void;
}

export function getResourceText(resourceUri: string, resource: MCPResourceContents): string {
  const text = resource.text ?? resource.blob;
  if (!text) {
    throw new Error(`Widget resource ${resourceUri} returned no text/blob contents.`);
  }
  return text;
}

export async function loadWidgetResource(
  resourceUri: string,
  readResource: (resourceUri: string) => Promise<MCPResourceContents>,
): Promise<string> {
  const resource = await readResource(resourceUri);
  return getResourceText(resourceUri, resource);
}

export async function handleWidgetBridgeMessage(message: unknown, callbacks: WidgetHostCallbacks): Promise<void> {
  const action = parseWidgetBridgeMessage(message);
  if (!action) {
    callbacks.onBridgeEvent?.("ignored-unknown-message");
    return;
  }

  if (action.kind === "resource.read") {
    callbacks.onBridgeEvent?.(`resource.read:${action.resourceUri}`);
    await callbacks.onReadResource(action.resourceUri);
    return;
  }

  callbacks.onBridgeEvent?.(`tool.call:${action.toolName}`);
  await callbacks.onCallTool(action.toolName, action.args);
}

export function sanitizeOpenLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeToolCallBridgeResult(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const candidate = payload as { run?: { result?: unknown } };
  if (!candidate.run || typeof candidate.run !== "object" || !("result" in candidate.run)) {
    return payload;
  }

  return candidate.run.result;
}
