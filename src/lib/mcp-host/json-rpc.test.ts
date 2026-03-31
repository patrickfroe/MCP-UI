import test from "node:test";
import assert from "node:assert/strict";
import { MCPStreamableHttpTransport } from "@/lib/mcp-host/json-rpc";
import { toMCPHostError } from "@/lib/mcp-host/errors";

test("MCPStreamableHttpTransport parses JSON-RPC payload from event stream", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  const originalFetch = global.fetch;

  global.fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: string };
    return new Response(
      `event: message\ndata: {"jsonrpc":"2.0","id":"${body.id}","result":{"ok":true}}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }) as typeof fetch;

  try {
    const result = await transport.request<{ ok: boolean }>("ping", {});
    assert.deepEqual(result, { ok: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test("MCPStreamableHttpTransport maps malformed event stream to protocol error", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  const originalFetch = global.fetch;

  global.fetch = (async () => new Response("event: message\ndata: not-json\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })) as typeof fetch;

  try {
    await assert.rejects(() => transport.request("ping", {}), (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "MCP_PROTOCOL_ERROR");
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }
});
