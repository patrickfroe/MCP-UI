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

function isJsonRpcPayload(value: unknown): value is JsonRpcResponse<unknown> {
  return Boolean(value && typeof value === "object" && (("result" in value) || ("error" in value)));
}

function parseSseJsonRpc<T>(body: string, expectedId: string): JsonRpcResponse<T> {
  const events = body.split(/\r?\n\r?\n/);
  for (const event of events) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (!dataLines.length) {
      continue;
    }

    const rawPayload = dataLines.join("\n");
    try {
      const parsed = JSON.parse(rawPayload) as unknown;
      if (!isJsonRpcPayload(parsed)) {
        continue;
      }
      if ("id" in parsed && parsed.id !== expectedId) {
        continue;
      }
      return parsed as JsonRpcResponse<T>;
    } catch {
      continue;
    }
  }
  throw new MCPAdapterError("MCP_PROTOCOL_ERROR", "MCP stream did not include a valid JSON-RPC payload.", {
    expectedId,
  });
}

export class MCPStreamableHttpTransport {
  private sessionId: string | null = null;
  private initializeParams: Record<string, unknown> | null = null;
  private initialized = false;

  constructor(
    private readonly baseUrl: string,
    private readonly options?: {
      headers?: Record<string, string>;
      authToken?: string;
      requestTimeoutMs?: number;
    },
  ) {}

  async request<T>(method: string, params?: Record<string, unknown>, allowRetry = true): Promise<T> {
    if (method !== "initialize" && !this.initialized) {
      throw new MCPAdapterError("MCP_PROTOCOL_ERROR", "Cannot send MCP request before initialize completes.", {
        method,
        transport: "streamable-http",
        initialized: this.initialized,
        hasSessionId: Boolean(this.sessionId),
        url: this.baseUrl,
      });
    }

    if (method === "initialize") {
      this.initializeParams = params ?? {};
    }

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
          ...(method !== "initialize" && this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
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

    if (method === "initialize") {
      const nextSessionId = response.headers?.get?.("mcp-session-id");
      this.sessionId = nextSessionId?.trim() || null;
    }

    if (!response.ok) {
      const payloadText = await response.text().catch(() => "");
      const failureDetails = {
        method,
        status: response.status,
        transport: "streamable-http",
        initialized: this.initialized,
        hasSessionId: Boolean(this.sessionId),
        url: this.baseUrl,
        path: this.safePathname(),
        includesSessionHeader: method !== "initialize" && Boolean(this.sessionId),
        hasAuthHeader: Boolean(this.options?.authToken),
        responsePreview: payloadText.slice(0, 400),
      };

      if (method !== "initialize" && response.status === 400 && allowRetry && this.initializeParams) {
        this.initialized = false;
        this.sessionId = null;
        await this.request("initialize", this.initializeParams, false);
        return this.request<T>(method, params, false);
      }

      throw new MCPAdapterError("MCP_PROTOCOL_ERROR", `MCP transport failed with status ${response.status}`, {
        ...failureDetails,
      });
    }

    const contentType = response.headers?.get?.("content-type") ?? "";
    const payload = contentType.includes("text/event-stream")
      ? parseSseJsonRpc<T>(await response.text(), id)
      : (await response.json()) as JsonRpcResponse<T>;

    if ("error" in payload) {
      throw new MCPAdapterError("MCP_PROTOCOL_ERROR", payload.error.message, {
        method,
        rpcCode: payload.error.code,
        rpcData: payload.error.data,
        transport: "streamable-http",
        initialized: this.initialized,
        hasSessionId: Boolean(this.sessionId),
        url: this.baseUrl,
        path: this.safePathname(),
      });
    }

    if (method === "initialize") {
      this.initialized = true;
    }

    return payload.result;
  }

  diagnostics() {
    return {
      transport: "streamable-http" as const,
      initialized: this.initialized,
      hasSessionId: Boolean(this.sessionId),
      url: this.baseUrl,
      path: this.safePathname(),
    };
  }

  private safePathname() {
    try {
      return new URL(this.baseUrl).pathname;
    } catch {
      return undefined;
    }
  }
}
