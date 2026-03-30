export interface MCPServerConnection {
  id: string;
  name: string;
  transport: "streamable-http";
  baseUrl: string;
  connected: boolean;
  connectedAt?: string;
}

export interface MCPToolUIBinding {
  resourceUri: string;
}

export interface MCPToolDescriptor {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  _meta?: {
    ui?: MCPToolUIBinding;
  };
}

export interface MCPToolRun {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  succeeded: boolean;
  createdAt: string;
}

export interface MCPHostError {
  code: string;
  message: string;
  details?: unknown;
}
