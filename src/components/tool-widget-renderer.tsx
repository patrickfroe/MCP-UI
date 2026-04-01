"use client";

import * as React from "react";
import { AppRenderer } from "@mcp-ui/client";
import { Card } from "@/components/ui/card";
import { hostClient } from "@/lib/host-client";
import { handleWidgetBridgeMessage, loadWidgetResource, normalizeToolCallBridgeResult, sanitizeOpenLinkUrl } from "@/lib/widget-runtime";

export type WidgetRenderStatus = "idle" | "loading" | "success" | "error";

interface ToolWidgetRendererProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: unknown;
  resourceUri: string;
  sandboxProxyUrl?: string;
  onError?: (message: string) => void;
  onStatusChange?: (status: WidgetRenderStatus) => void;
  onDebugEvent?: (event: string) => void;
}

export function ToolWidgetRenderer({
  toolName,
  toolInput,
  toolResult,
  resourceUri,
  sandboxProxyUrl = "/sandbox-proxy.html",
  onError,
  onStatusChange,
  onDebugEvent,
}: ToolWidgetRendererProps) {
  const [resourceText, setResourceText] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const readResource = React.useCallback(async (nextUri: string) => {
    onDebugEvent?.(`onReadResource:start uri=${nextUri}`);
    const resource = await hostClient.readResource(nextUri);
    onDebugEvent?.(`onReadResource:ok uri=${nextUri} mime=${resource.mimeType ?? "unknown"} chars=${(resource.text ?? resource.blob ?? "").length}`);
    return resource;
  }, [onDebugEvent]);

  const callTool = React.useCallback((nextToolName: string, args: Record<string, unknown>) => {
    onDebugEvent?.(`onCallTool:start tool=${nextToolName} args=${JSON.stringify(args)}`);
    return hostClient.callTool(nextToolName, args).then((payload) => {
      const normalized = normalizeToolCallBridgeResult(payload);
      onDebugEvent?.(`onCallTool:ok tool=${nextToolName} normalizedType=${typeof normalized}`);
      return normalized;
    });
  }, [onDebugEvent]);

  React.useEffect(() => {
    let alive = true;

    setResourceText(null);
    setLoadError(null);
    onDebugEvent?.(
      `widget:mount tool=${toolName} uri=${resourceUri} input=${JSON.stringify(toolInput)} result=${JSON.stringify(toolResult)}`,
    );
    onStatusChange?.("loading");

    void (async () => {
      try {
        const text = await loadWidgetResource(resourceUri, readResource);
        if (!alive) {
          return;
        }
        setResourceText(text);
        onDebugEvent?.(`widget:resource-loaded uri=${resourceUri} chars=${text.length}`);
      } catch (error) {
        if (!alive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to load widget resource.";
        setLoadError(message);
        onStatusChange?.("error");
        onError?.(message);
        onDebugEvent?.(`widget:resource-load-failed uri=${resourceUri} message=${message}`);
      }
    })();

    return () => {
      alive = false;
    };
  }, [onDebugEvent, onError, onStatusChange, readResource, resourceUri, toolInput, toolName, toolResult]);

  if (loadError) {
    return <Card className="p-3 text-sm text-red-700">Widget failed to load: {loadError}</Card>;
  }

  if (!resourceText) {
    return <Card className="p-3 text-sm text-slate-600">Loading widget resource…</Card>;
  }

  return (
    <Card className="h-full min-h-40 overflow-hidden p-2">
      <AppRenderer
        key={`${toolName}:${resourceUri}`}
        sandboxProxyUrl={sandboxProxyUrl}
        resourceUri={resourceUri}
        resourceText={resourceText}
        toolName={toolName}
        toolInput={toolInput}
        toolResult={toolResult}
        onReadResource={readResource}
        onCallTool={callTool}
        onOpenLink={(url: string) => {
          const safeUrl = sanitizeOpenLinkUrl(url);
          if (!safeUrl) {
            onError?.(`Widget requested unsupported link protocol: ${url}`);
            return;
          }
          if (typeof window !== "undefined") {
            window.open(safeUrl, "_blank", "noopener,noreferrer");
          }
        }}
        onMessage={(message: unknown) => {
          onDebugEvent?.(`onMessage ${JSON.stringify(message)}`);
          void handleWidgetBridgeMessage(message, {
            onReadResource: readResource,
            onCallTool: callTool,
            onBridgeError: (messageText) => {
              onDebugEvent?.(`onBridgeError ${messageText}`);
              onError?.(messageText);
            },
            onBridgeEvent: (event) => onDebugEvent?.(`bridge:${event}`),
          }).catch((error) => {
            const messageText = error instanceof Error ? error.message : "Widget bridge callback failed.";
            onStatusChange?.("error");
            onError?.(messageText);
            onDebugEvent?.(`onMessage:callback-error ${messageText}`);
          });
        }}
        onError={(error: unknown) => {
          onStatusChange?.("error");
          const message = error instanceof Error ? error.message : "Widget render error.";
          onDebugEvent?.(`onError ${message}`);
          onError?.(message);
        }}
        onLoad={() => {
          onStatusChange?.("success");
          onDebugEvent?.("onLoad");
        }}
        host={{
          readResource,
          callTool,
        }}
      />
    </Card>
  );
}
