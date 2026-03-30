export type MCPConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MCPServerConnection {
  id: string;
  name: string;
  transport: "streamable-http";
  baseUrl: string;
  status: MCPConnectionStatus;
  connectedAt?: string;
  lastError?: MCPHostError;
  serverInfo?: {
    name?: string;
    version?: string;
    instructions?: string;
  };
  raw?: unknown;
}

export interface MCPToolUIBinding {
  resourceUri: string;
}

export interface MCPToolInputSchema {
  type?: string;
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
  raw?: unknown;
}

export interface MCPToolDescriptor {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: MCPToolInputSchema;
  uiBinding?: MCPToolUIBinding;
  raw?: unknown;
}

export interface MCPToolRun {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  succeeded: boolean;
  createdAt: string;
  raw?: unknown;
}

export interface MCPResourceContents {
  resourceUri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  raw?: unknown;
}

export interface MCPHostError {
  code:
    | "BAD_REQUEST"
    | "NOT_CONNECTED"
    | "CONNECTION_FAILED"
    | "MCP_PROTOCOL_ERROR"
    | "TOOL_CALL_FAILED"
    | "RESOURCE_READ_FAILED"
    | "INTERNAL_ERROR";
  message: string;
  details?: unknown;
}
