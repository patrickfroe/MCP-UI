import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { MCPHostRuntime, createTransportAdapter } from "@/lib/mcp-host/adapter";
import { MCPAdapterError, toMCPHostError } from "@/lib/mcp-host/errors";

function jsonRpc(result: unknown) {
  return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: "1", result }) } as Response;
}

test("adapter selection by transport type", () => {
  const http = createTransportAdapter({ type: "streamable-http", url: "http://localhost:3001/mcp" });
  const stdio = createTransportAdapter({ type: "stdio", command: "node", args: ["server.js"] });
  assert.ok(http.status().transport === "streamable-http");
  assert.ok(stdio.status().transport === "stdio");
});

test("http connection status lifecycle covers disconnected/connecting/connected/error", async () => {
  const adapter = new MCPHostRuntime();
  const originalFetch = global.fetch;
  let capturedStatusWhileConnecting: string | null = null;

  global.fetch = (async () => {
    capturedStatusWhileConnecting = adapter.status().status;
    return jsonRpc({ serverInfo: { name: "Demo" } });
  }) as typeof fetch;

  try {
    const connected = await adapter.connect({ type: "streamable-http", url: "http://localhost:3001/mcp" });
    assert.equal(capturedStatusWhileConnecting, "connecting");
    assert.equal(connected.status, "connected");

    global.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await assert.rejects(() => adapter.connect({ type: "streamable-http", url: "http://localhost:3001/mcp" }), (error: unknown) => {
      assert.ok(error instanceof MCPAdapterError);
      assert.equal(error.code, "CONNECTION_FAILED");
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("stdio integration: connect, listTools, callTool, readResource, disconnect", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");

  const connection = await adapter.connect({
    type: "stdio",
    command: process.execPath,
    args: ["--import", "tsx", serverScript],
    startupTimeoutMs: 4000,
    requestTimeoutMs: 4000,
  });

  assert.equal(connection.status, "connected");
  assert.equal(connection.transport, "stdio");

  const tools = await adapter.listTools();
  assert.equal(tools.length, 2);
  assert.equal(tools[1]?.uiBinding?.resourceUri, "ui://stocks/chart");

  const run = await adapter.callTool("echo.text", { text: "ok" });
  assert.equal(run.succeeded, true);

  const resource = await adapter.readResource("ui://stocks/chart");
  assert.equal(resource.mimeType, "text/html");

  const disconnected = await adapter.disconnect();
  assert.equal(disconnected.status, "disconnected");
});

test("stdio invalid command maps structured PROCESS_START_FAILED error", async () => {
  const adapter = new MCPHostRuntime();
  await assert.rejects(
    () => adapter.connect({ type: "stdio", command: "__command_does_not_exist__", args: [] }),
    (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "PROCESS_START_FAILED");
      return true;
    },
  );
});

test("stdio startup timeout maps STARTUP_TIMEOUT error", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  await assert.rejects(
    () =>
      adapter.connect({
        type: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", serverScript],
        env: { MCP_STDIO_DELAY_INIT_MS: "2000" },
        startupTimeoutMs: 50,
      }),
    (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "STARTUP_TIMEOUT");
      return true;
    },
  );
});

test("stdio reconnect replaces previous session and handles unexpected exit", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");

  await adapter.connect({ type: "stdio", command: process.execPath, args: ["--import", "tsx", serverScript] });
  const firstPid = adapter.status().process?.pid;

  await adapter.connect({
    type: "stdio",
    command: process.execPath,
    args: ["--import", "tsx", serverScript],
    env: { MCP_STDIO_EXIT_ON_MESSAGE: "1" },
  });
  const secondPid = adapter.status().process?.pid;
  assert.notEqual(firstPid, secondPid);

  await assert.rejects(() => adapter.listTools(), (error: unknown) => {
    const mapped = toMCPHostError(error, "INTERNAL_ERROR");
    assert.equal(mapped.code, "PROCESS_EXITED");
    return true;
  });
  await adapter.disconnect();
});
