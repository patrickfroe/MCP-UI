import test from "node:test";
import assert from "node:assert/strict";
import { MCPHostAdapter } from "@/lib/mcp-host/adapter";
import { MCPAdapterError, toMCPHostError } from "@/lib/mcp-host/errors";

function jsonRpc(result: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: "1", result }),
  } as Response;
}

test("connection status lifecycle covers disconnected/connecting/connected/error", async () => {
  const adapter = new MCPHostAdapter();
  assert.equal(adapter.status().status, "disconnected");

  const originalFetch = global.fetch;
  let capturedStatusWhileConnecting: string | null = null;

  global.fetch = (async () => {
    capturedStatusWhileConnecting = adapter.status().status;
    return jsonRpc({ serverInfo: { name: "Demo" } });
  }) as typeof fetch;

  try {
    const connected = await adapter.connect("http://localhost:3001/mcp");
    assert.equal(capturedStatusWhileConnecting, "connecting");
    assert.equal(connected.status, "connected");
    assert.equal(adapter.status().status, "connected");

    global.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await assert.rejects(async () => adapter.connect("http://localhost:3001/mcp"), (error: unknown) => {
      assert.ok(error instanceof MCPAdapterError);
      assert.equal(error.code, "CONNECTION_FAILED");
      return true;
    });
    assert.equal(adapter.status().status, "error");
    assert.equal(adapter.status().lastError?.code, "CONNECTION_FAILED");
  } finally {
    global.fetch = originalFetch;
  }
});

test("listTools normalizes descriptors and malformed tool metadata", async () => {
  const adapter = new MCPHostAdapter();
  const originalFetch = global.fetch;

  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return jsonRpc({ serverInfo: { name: "Demo" } });
    }
    return jsonRpc({
      tools: [
        { name: "echo.text", title: "Echo" },
        { title: "Broken" },
        { name: "stocks.chart", _meta: { ui: { resourceUri: "ui://stocks/chart" } } },
      ],
    });
  }) as typeof fetch;

  try {
    await adapter.connect("http://localhost:3001/mcp");
    const tools = await adapter.listTools();
    assert.equal(tools.length, 2);
    assert.equal(tools[1]?.uiBinding?.resourceUri, "ui://stocks/chart");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callTool/readResource normalize values and map structured adapter errors", async () => {
  const adapter = new MCPHostAdapter();
  const originalFetch = global.fetch;

  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return jsonRpc({ serverInfo: { name: "Demo" } });
    }
    if (calls === 2) {
      return jsonRpc({ content: [{ type: "text", text: "ok" }] });
    }
    if (calls === 3) {
      return jsonRpc({ contents: [{ mimeType: "text/html", text: "<html/>" }] });
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: "1", error: { code: -32000, message: "boom" } }),
    } as Response;
  }) as typeof fetch;

  try {
    await adapter.connect("http://localhost:3001/mcp");

    const run = await adapter.callTool("echo.text", { text: "ok" });
    assert.equal(run.toolName, "echo.text");
    assert.equal(run.succeeded, true);

    const resource = await adapter.readResource("ui://stocks/chart");
    assert.equal(resource.mimeType, "text/html");

    await assert.rejects(async () => adapter.callTool("echo.text", {}), (error: unknown) => {
      assert.ok(error instanceof MCPAdapterError);
      assert.equal(error.code, "TOOL_CALL_FAILED");
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "TOOL_CALL_FAILED");
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("not connected requests map to NOT_CONNECTED", async () => {
  const adapter = new MCPHostAdapter();
  await assert.rejects(async () => adapter.listTools(), (error: unknown) => {
    assert.ok(error instanceof MCPAdapterError);
    assert.equal(error.code, "NOT_CONNECTED");
    return true;
  });
});
