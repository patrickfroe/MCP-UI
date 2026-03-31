export type MCPTransportType = "streamable-http" | "stdio";

export type MCPConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type MCPServerConfig =
  | {
      type: "streamable-http";
      url: string;
      headers?: Record<string, string>;
      authToken?: string;
      name?: string;
      requestTimeoutMs?: number;
    }
  | {
      type: "stdio";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      startupTimeoutMs?: number;
      requestTimeoutMs?: number;
      name?: string;
    };

export interface MCPServerConnection {
  id: string;
  name: string;
  transport: MCPTransportType;
  baseUrl?: string;
  status: MCPConnectionStatus;
  connectedAt?: string;
  lastError?: MCPHostError;
  serverInfo?: {
    name?: string;
    version?: string;
    instructions?: string;
  };
  process?: {
    pid?: number;
    command?: string;
    args?: string[];
    envKeys?: string[];
    exited?: boolean;
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    stderrTail?: string[];
    malformedResponseCount?: number;
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
    | "PROCESS_START_FAILED"
    | "PROCESS_EXITED"
    | "STARTUP_TIMEOUT"
    | "REQUEST_TIMEOUT"
    | "INTERNAL_ERROR";
  message: string;
  details?: unknown;
}

export interface MCPHostAdapter {
  connect(config: MCPServerConfig): Promise<MCPServerConnection>;
  status(): MCPServerConnection;
  listTools(): Promise<MCPToolDescriptor[]>;
  callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolRun>;
  readResource(resourceUri: string): Promise<MCPResourceContents>;
  disconnect(): Promise<MCPServerConnection>;
}
