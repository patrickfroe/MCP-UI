"use client";

import * as React from "react";
import * as MCPUIClient from "@mcp-ui/client";
import { Card } from "@/components/ui/card";

const AppRenderer = (MCPUIClient as Record<string, React.ComponentType<any>>).AppRenderer;

interface ToolWidgetRendererProps {
  resourceUri: string;
  resourceContents: string;
}

export function ToolWidgetRenderer({ resourceUri, resourceContents }: ToolWidgetRendererProps) {
  if (!AppRenderer) {
    return <Card className="p-3 text-sm text-red-600">@mcp-ui/client AppRenderer is unavailable.</Card>;
  }

  return (
    <Card className="h-full min-h-40 overflow-hidden p-2">
      <AppRenderer
        sandboxProxyUrl="/sandbox-proxy.html"
        resourceUri={resourceUri}
        resourceText={resourceContents}
      />
    </Card>
  );
}
