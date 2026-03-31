"use client";

import * as React from "react";
import * as MCPUIClient from "@mcp-ui/client";
import { Card } from "@/components/ui/card";
import { hostClient } from "@/lib/host-client";

type RendererProps = Record<string, unknown>;
const AppRenderer = (MCPUIClient as Record<string, React.ComponentType<RendererProps>>).AppRenderer;

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
        const data = await hostClient.readResource(resourceUri);
        if (!alive) {
          return;
        }
        const text = data.text ?? data.blob;
        if (!text) {
          throw new Error("Widget resource is empty.");
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
  }, [resourceUri, onError, onStatusChange]);

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
        onOpenLink={(url: string) => {
          if (typeof window !== "undefined") {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
        onMessage={(message: unknown) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            (message as { type?: string }).type === "resource.read" &&
            "resourceUri" in message
          ) {
            const nextUri = String((message as { resourceUri: unknown }).resourceUri);
            void hostClient.readResource(nextUri).catch((error) => {
              const messageText = error instanceof Error ? error.message : "Widget resource.read failed.";
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
          readResource: (nextUri: string) => hostClient.readResource(nextUri),
          callTool: (nextToolName: string, args: Record<string, unknown>) => hostClient.callTool(nextToolName, args),
        }}
      />
    </Card>
  );
}
