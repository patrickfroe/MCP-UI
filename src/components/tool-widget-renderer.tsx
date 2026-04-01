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
}

export function ToolWidgetRenderer({
  toolName,
  toolInput,
  toolResult,
  resourceUri,
  sandboxProxyUrl = "/sandbox-proxy.html",
  onError,
  onStatusChange,
}: ToolWidgetRendererProps) {
  const [resourceText, setResourceText] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const readResource = React.useCallback(async (nextUri: string) => {
    return hostClient.readResource(nextUri);
  }, []);

  const callTool = React.useCallback((nextToolName: string, args: Record<string, unknown>) => {
    return hostClient.callTool(nextToolName, args).then(normalizeToolCallBridgeResult);
  }, []);

  React.useEffect(() => {
    let alive = true;

    setResourceText(null);
    setLoadError(null);
    onStatusChange?.("loading");

    void (async () => {
      try {
        const text = await loadWidgetResource(resourceUri, readResource);
        if (!alive) {
          return;
        }
        setResourceText(text);
      } catch (error) {
        if (!alive) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to load widget resource.";
        setLoadError(message);
        onStatusChange?.("error");
        onError?.(message);
      }
    })();

    return () => {
      alive = false;
    };
  }, [resourceUri, onError, onStatusChange, readResource]);

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
          void handleWidgetBridgeMessage(message, {
            onReadResource: readResource,
            onCallTool: callTool,
            onBridgeError: onError,
          }).catch((error) => {
            const messageText = error instanceof Error ? error.message : "Widget bridge callback failed.";
            onStatusChange?.("error");
            onError?.(messageText);
          });
        }}
        onError={(error: unknown) => {
          onStatusChange?.("error");
          onError?.(error instanceof Error ? error.message : "Widget render error.");
        }}
        onLoad={() => {
          onStatusChange?.("success");
        }}
        host={{
          readResource,
          callTool,
        }}
      />
    </Card>
  );
}
