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

test("http connect surfaces REQUEST_TIMEOUT when configured timeout is exceeded", async () => {
  const adapter = new MCPHostRuntime();
  const originalFetch = global.fetch;
  global.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    })) as typeof fetch;

  try {
    await assert.rejects(
      () => adapter.connect({ type: "streamable-http", url: "http://localhost:3001/mcp", requestTimeoutMs: 5 }),
      (error: unknown) => {
        const mapped = toMCPHostError(error, "INTERNAL_ERROR");
        assert.equal(mapped.code, "REQUEST_TIMEOUT");
        return true;
      },
    );
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

test("stdio config validation rejects invalid stdio config fields", async () => {
  const adapter = new MCPHostRuntime();
  await assert.rejects(
    () => adapter.connect({ type: "stdio", command: "   ", args: [] }),
    (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "BAD_REQUEST");
      return true;
    },
  );

  await assert.rejects(
    () => adapter.connect({ type: "stdio", command: process.execPath, startupTimeoutMs: 0 }),
    (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "BAD_REQUEST");
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

test("stdio request timeout maps REQUEST_TIMEOUT after successful startup", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  await adapter.connect({
    type: "stdio",
    command: process.execPath,
    args: ["--import", "tsx", serverScript],
    env: { MCP_STDIO_DELAY_TOOLS_MS: "2000" },
    requestTimeoutMs: 20,
  });

  await assert.rejects(() => adapter.listTools(), (error: unknown) => {
    const mapped = toMCPHostError(error, "INTERNAL_ERROR");
    assert.equal(mapped.code, "REQUEST_TIMEOUT");
    return true;
  });
  await adapter.disconnect();
});

test("stdio diagnostics bound stderr and avoid env value leakage", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  await assert.rejects(
    () =>
      adapter.connect({
        type: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", serverScript],
        env: { MCP_STDIO_SPAM_STDERR_LINES: "120", MCP_STDIO_EXIT_ON_MESSAGE: "1", SECRET_TOKEN: "top-secret" },
      }),
    () => true,
  );
  const processInfo = adapter.status().process;
  assert.ok((processInfo?.stderrTail?.length ?? 0) <= 40);
  assert.ok((processInfo?.envKeys ?? []).includes("SECRET_TOKEN"));
  assert.equal(JSON.stringify(processInfo).includes("top-secret"), false);
  await adapter.disconnect();
});

test("stdio malformed response maps MCP_PROTOCOL_ERROR and marks connection errored", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  await assert.rejects(
    () =>
      adapter.connect({
        type: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", serverScript],
        env: { MCP_STDIO_MALFORMED_RESPONSE: "1" },
      }),
    (error: unknown) => {
      const mapped = toMCPHostError(error, "INTERNAL_ERROR");
      assert.equal(mapped.code, "MCP_PROTOCOL_ERROR");
      return true;
    },
  );
  assert.equal(adapter.status().status, "error");
  assert.ok((adapter.status().process?.malformedResponseCount ?? 0) > 0);
});

test("stdio repeated connect/disconnect cycles do not leak active process state", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  for (let i = 0; i < 3; i += 1) {
    await adapter.connect({ type: "stdio", command: process.execPath, args: ["--import", "tsx", serverScript] });
    assert.equal(adapter.status().status, "connected");
    await adapter.disconnect();
    assert.equal(adapter.status().status, "disconnected");
    assert.equal(adapter.status().process, undefined);
  }
});

test("stdio reconnect succeeds cleanly after failed startup", async () => {
  const adapter = new MCPHostRuntime();
  const serverScript = path.join(process.cwd(), "src/test-utils/mcp-stdio-server.ts");
  await assert.rejects(
    () =>
      adapter.connect({
        type: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", serverScript],
        startupTimeoutMs: 10,
        env: { MCP_STDIO_DELAY_INIT_MS: "1000" },
      }),
    () => true,
  );
  assert.notEqual(adapter.status().status, "connected");
  await adapter.connect({ type: "stdio", command: process.execPath, args: ["--import", "tsx", serverScript] });
  assert.equal(adapter.status().status, "connected");
  await adapter.disconnect();
});
