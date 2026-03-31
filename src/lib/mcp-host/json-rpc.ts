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
  constructor(
    private readonly baseUrl: string,
    private readonly options?: {
      headers?: Record<string, string>;
      authToken?: string;
      requestTimeoutMs?: number;
    },
  ) {}

  async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    const timeout = this.options?.requestTimeoutMs && this.options.requestTimeoutMs > 0
      ? setTimeout(() => controller.abort(), this.options.requestTimeoutMs)
      : undefined;
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.options?.authToken ? { Authorization: `Bearer ${this.options.authToken}` } : {}),
          ...(this.options?.headers ?? {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MCPAdapterError("REQUEST_TIMEOUT", `${method} timed out`, {
          method,
          timeoutMs: this.options?.requestTimeoutMs,
        });
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

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
