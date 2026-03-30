import type { MCPServerConnection, MCPToolDescriptor, MCPToolRun } from "@/lib/types";

async function hostRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: "Host API request failed" }));
    throw new Error(errorBody.message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const hostClient = {
  connect: (baseUrl: string) =>
    hostRequest<{ connection: MCPServerConnection }>("/api/host/connect", {
      method: "POST",
      body: JSON.stringify({ baseUrl }),
    }),

  status: () => hostRequest<{ connection: MCPServerConnection }>("/api/host/status"),

  listTools: () => hostRequest<{ tools: MCPToolDescriptor[] }>("/api/host/list-tools"),

  callTool: (toolName: string, args: Record<string, unknown>) =>
    hostRequest<{ run: MCPToolRun }>("/api/host/call-tool", {
      method: "POST",
      body: JSON.stringify({ toolName, args }),
    }),

  readResource: (resourceUri: string) =>
    hostRequest<{ resourceUri: string; contents: string }>("/api/host/read-resource", {
      method: "POST",
      body: JSON.stringify({ resourceUri }),
    }),
};
