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

export interface PostMessageTransportOptions {
  targetWindow?: Window;
  targetOrigin?: string;
}

export declare class PostMessageTransport {
  constructor(options?: PostMessageTransportOptions);
  onMessage(handler: (message: unknown) => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: unknown): void;
}

export declare class App {
  constructor(input: { transport: PostMessageTransport });
  ontoolinput(handler: (payload: unknown) => void): void;
  ontoolresult(handler: (payload: unknown) => void): void;
  onhostcontextchanged(handler: (payload: unknown) => void): void;
  onteardown(handler: () => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export declare function AppRenderer(props: AppRendererProps): React.ReactElement;
