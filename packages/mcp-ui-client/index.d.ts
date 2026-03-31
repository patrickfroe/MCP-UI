import * as React from "react";

export interface AppRendererHost {
  readResource?: (resourceUri: string) => Promise<unknown>;
  callTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface AppRendererProps {
  sandboxProxyUrl: string;
  resourceUri: string;
  resourceText: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  host?: AppRendererHost;
  onReadResource?: (resourceUri: string) => Promise<unknown>;
  onCallTool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  onOpenLink?: (url: string) => void;
  onMessage?: (message: unknown) => void;
  onError?: (error: unknown) => void;
  onLoad?: () => void;
}

export declare function AppRenderer(props: AppRendererProps): React.ReactElement;
export declare const __MCP_UI_CLIENT_SHIM__: boolean;
