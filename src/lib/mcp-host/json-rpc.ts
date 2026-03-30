import { MCPAdapterError } from "@/lib/mcp-host/errors";

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: string;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

export class MCPStreamableHttpTransport {
  constructor(private readonly baseUrl: string) {}

  async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = crypto.randomUUID();
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new MCPAdapterError("MCP_PROTOCOL_ERROR", `MCP transport failed with status ${response.status}`, {
        method,
        status: response.status,
      });
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;

    if ("error" in payload) {
      throw new MCPAdapterError("MCP_PROTOCOL_ERROR", payload.error.message, {
        method,
        rpcCode: payload.error.code,
        rpcData: payload.error.data,
      });
    }

    return payload.result;
  }
}
