import test from "node:test";
import assert from "node:assert/strict";
import { MCPStreamableHttpTransport } from "@/lib/mcp-host/json-rpc";
import { toMCPHostError } from "@/lib/mcp-host/errors";

test("MCPStreamableHttpTransport parses JSON-RPC payload from event stream", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  const originalFetch = global.fetch;

  global.fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: string; method: string };
    if (body.method === "initialize") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "demo" } } }),
        { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-1" } },
      );
    }
    return new Response(
      `event: message\ndata: {"jsonrpc":"2.0","id":"${body.id}","result":{"ok":true}}\n\n`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }) as typeof fetch;

  try {
    await transport.request("initialize", { protocolVersion: "2025-03-26" });
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

test("MCPStreamableHttpTransport requires initialize before non-initialize requests", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  await assert.rejects(() => transport.request("tools/list", {}), (error: unknown) => {
    const mapped = toMCPHostError(error, "INTERNAL_ERROR");
    assert.equal(mapped.code, "MCP_PROTOCOL_ERROR");
    assert.equal((mapped.details as { initialized?: boolean }).initialized, false);
    return true;
  });
});

test("MCPStreamableHttpTransport stores and sends mcp-session-id after initialize", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  const originalFetch = global.fetch;
  let listRequestSessionHeader: string | null = null;

  global.fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; id: string };
    const headers = new Headers(init?.headers as HeadersInit);
    if (body.method === "initialize") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "demo" } } }),
        { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-123" } },
      );
    }
    listRequestSessionHeader = headers.get("mcp-session-id");
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [] } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    await transport.request("initialize", { protocolVersion: "2025-03-26" });
    await transport.request("tools/list", {});
    assert.equal(listRequestSessionHeader, "session-123");
  } finally {
    global.fetch = originalFetch;
  }
});

test("MCPStreamableHttpTransport retries once after 400 by re-initializing", async () => {
  const transport = new MCPStreamableHttpTransport("http://localhost:3001/mcp");
  const originalFetch = global.fetch;
  let initializeCount = 0;
  let listCount = 0;

  global.fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; id: string };
    if (body.method === "initialize") {
      initializeCount += 1;
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "demo" } } }),
        { status: 200, headers: { "content-type": "application/json", "mcp-session-id": `session-${initializeCount}` } },
      );
    }
    listCount += 1;
    if (listCount === 1) {
      return new Response("missing/expired session", { status: 400, headers: { "content-type": "text/plain" } });
    }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "echo.text" }] } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    await transport.request("initialize", { protocolVersion: "2025-03-26" });
    const result = await transport.request<{ tools: { name: string }[] }>("tools/list", {});
    assert.equal(initializeCount, 2);
    assert.equal(listCount, 2);
    assert.equal(result.tools[0]?.name, "echo.text");
  } finally {
    global.fetch = originalFetch;
  }
});
