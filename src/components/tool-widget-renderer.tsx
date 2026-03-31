"use client";

import * as React from "react";
import * as MCPUIClient from "@mcp-ui/client";
import { Card } from "@/components/ui/card";
import { hostClient } from "@/lib/host-client";

type RendererProps = Record<string, unknown>;
const AppRenderer = (MCPUIClient as unknown as Record<string, React.ComponentType<RendererProps>>).AppRenderer;

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
    const data = await hostClient.readResource(nextUri);
    const text = data.text ?? data.blob;
    if (!text) {
      throw new Error(`Widget resource ${nextUri} is empty.`);
    }
    return data;
  }, []);

  const callTool = React.useCallback((nextToolName: string, args: Record<string, unknown>) => {
    return hostClient.callTool(nextToolName, args);
  }, []);

  React.useEffect(() => {
    if (!AppRenderer) {
      onStatusChange?.("error");
      onError?.("@mcp-ui/client AppRenderer is unavailable.");
    }
  }, [onError, onStatusChange]);

  React.useEffect(() => {
    let alive = true;

    if (!AppRenderer) {
      return () => {
        alive = false;
      };
    }

    setResourceText(null);
    setLoadError(null);
    onStatusChange?.("loading");

    void (async () => {
      try {
        const data = await readResource(resourceUri);
        if (!alive) {
          return;
        }
        setResourceText(data.text ?? data.blob ?? null);
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

  if (!AppRenderer) {
    return <Card className="p-3 text-sm text-red-600">@mcp-ui/client AppRenderer is unavailable.</Card>;
  }

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
          if (typeof window !== "undefined") {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
        onMessage={(message: unknown) => {
          if (!message || typeof message !== "object" || !("type" in message)) {
            return;
          }

          const typed = message as { type?: string; resourceUri?: unknown; toolName?: unknown; args?: unknown };
          if (typed.type === "resource.read" && typed.resourceUri) {
            void readResource(String(typed.resourceUri)).catch((error) => {
              const messageText = error instanceof Error ? error.message : "Widget resource.read failed.";
              onStatusChange?.("error");
              onError?.(messageText);
            });
          }

          if (typed.type === "tool.call" && typed.toolName) {
            void callTool(String(typed.toolName), (typed.args ?? {}) as Record<string, unknown>).catch((error) => {
              const messageText = error instanceof Error ? error.message : "Widget tool.call failed.";
              onStatusChange?.("error");
              onError?.(messageText);
            });
          }
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
