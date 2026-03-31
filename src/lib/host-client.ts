import type {
  MCPHostError,
  MCPResourceContents,
  MCPServerConfig,
  MCPServerConnection,
  MCPToolDescriptor,
  MCPToolRun,
} from "@/lib/types";

interface HostErrorResponse {
  error?: MCPHostError;
  message?: string;
}

async function hostRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & HostErrorResponse;

  if (!response.ok) {
    if (payload.error) {
      throw new Error(`${payload.error.code}: ${payload.error.message}`);
    }
    throw new Error(payload.message ?? `Request failed: ${response.status}`);
  }

  return payload as T;
}

export const hostClient = {
  connect: (config: MCPServerConfig) =>
    hostRequest<{ connection: MCPServerConnection }>("/api/host/connect", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  disconnect: () =>
    hostRequest<{ connection: MCPServerConnection }>("/api/host/disconnect", {
      method: "POST",
      body: "{}",
    }),

  status: () => hostRequest<{ connection: MCPServerConnection }>("/api/host/status"),

  listTools: () => hostRequest<{ tools: MCPToolDescriptor[] }>("/api/host/list-tools"),

  callTool: (toolName: string, args: Record<string, unknown>) =>
    hostRequest<{ run: MCPToolRun }>("/api/host/call-tool", {
      method: "POST",
      body: JSON.stringify({ toolName, args }),
    }),

  readResource: (resourceUri: string) =>
    hostRequest<MCPResourceContents>("/api/host/read-resource", {
      method: "POST",
      body: JSON.stringify({ resourceUri }),
    }),
};
