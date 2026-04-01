import test from "node:test";
import assert from "node:assert/strict";
import { POST as connectPost } from "@/app/api/host/connect/route";
import { POST as disconnectPost } from "@/app/api/host/disconnect/route";
import { GET as statusGet } from "@/app/api/host/status/route";
import { GET as listToolsGet } from "@/app/api/host/list-tools/route";
import { POST as callToolPost } from "@/app/api/host/call-tool/route";
import { POST as readResourcePost } from "@/app/api/host/read-resource/route";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { MCPAdapterError } from "@/lib/mcp-host/errors";
import { makeResource, makeRun, makeTool } from "@/test-utils/fixtures";

type AdapterMethod = "connect" | "disconnect" | "status" | "listTools" | "callTool" | "readResource";
const originals: Partial<Record<AdapterMethod, unknown>> = {};
function stubMethod<K extends AdapterMethod>(name: K, fn: (typeof mcpHostAdapter)[K]) {
  if (!(name in originals)) originals[name] = mcpHostAdapter[name];
  (mcpHostAdapter[name] as unknown) = fn;
}
function restoreMethods() {
  for (const name of Object.keys(originals) as AdapterMethod[]) {
    (mcpHostAdapter[name] as unknown) = originals[name] as (typeof mcpHostAdapter)[typeof name];
  }
}

test.afterEach(() => restoreMethods());

test("connect endpoint supports HTTP and STDIO config normalization", async () => {
  stubMethod("connect", (async (config) => ({
    id: "single-server",
    name: "Configured MCP Server",
    transport: config.type,
    baseUrl: config.type === "streamable-http" ? config.url : undefined,
    status: "connected",
  })) as (typeof mcpHostAdapter)["connect"]);

  const httpOk = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "streamable-http", url: "http://localhost:3333/mcp" }) }));
  assert.equal(httpOk.status, 200);
  const httpPayload = (await httpOk.json()) as { connection: { baseUrl: string } };
  assert.equal(httpPayload.connection.baseUrl, "http://localhost:3333/mcp");

  const stdioOk = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "stdio", command: "node", args: ["server.js"], env: { FOO: "bar" } }) }));
  assert.equal(stdioOk.status, 200);
  const stdioPayload = (await stdioOk.json()) as { connection: { transport: string } };
  assert.equal(stdioPayload.connection.transport, "stdio");

  stubMethod("connect", (async () => {
    throw new MCPAdapterError("CONNECTION_FAILED", "connect failed");
  }) as (typeof mcpHostAdapter)["connect"]);

  const fail = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "streamable-http", url: "http://localhost:9999/mcp" }) }));
  assert.equal(fail.status, 500);

  const bad = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "stdio", command: "node", args: [1] }) }));
  assert.equal(bad.status, 400);

  const badHttp = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "streamable-http", url: "http://localhost:3333/mcp", headers: ["nope"] }) }));
  assert.equal(badHttp.status, 400);
});

test("disconnect/status/listTools endpoints", async () => {
  stubMethod("disconnect", (async () => ({ id: "single-server", name: "Configured MCP Server", transport: "stdio", status: "disconnected" })) as (typeof mcpHostAdapter)["disconnect"]);
  const disconnected = await disconnectPost();
  assert.equal(disconnected.status, 200);

  stubMethod("status", (() => ({ id: "single-server", name: "Configured MCP Server", transport: "streamable-http", baseUrl: "http://localhost:3001/mcp", status: "connected" })) as (typeof mcpHostAdapter)["status"]);
  const status = await statusGet();
  assert.equal(status.status, 200);

  stubMethod("listTools", (async () => [makeTool({ raw: { hidden: true } })]) as (typeof mcpHostAdapter)["listTools"]);
  const list = await listToolsGet();
  assert.equal(list.status, 200);
});

test("callTool and readResource endpoint success/bad-request/error paths", async () => {
  stubMethod("callTool", (async (toolName: string, args: Record<string, unknown>) => makeRun({ toolName, args })) as (typeof mcpHostAdapter)["callTool"]);
  const ok = await callToolPost(new Request("http://localhost/api/host/call-tool", { method: "POST", body: JSON.stringify({ toolName: "echo.text", args: { text: "hi" } }) }));
  assert.equal(ok.status, 200);

  const bad = await callToolPost(new Request("http://localhost/api/host/call-tool", { method: "POST", body: JSON.stringify({ args: {} }) }));
  assert.equal(bad.status, 400);

  stubMethod("callTool", (async () => {
    throw new MCPAdapterError("TOOL_CALL_FAILED", "tool fail");
  }) as (typeof mcpHostAdapter)["callTool"]);
  const fail = await callToolPost(new Request("http://localhost/api/host/call-tool", { method: "POST", body: JSON.stringify({ toolName: "echo.text", args: {} }) }));
  assert.equal(fail.status, 500);

  stubMethod("readResource", (async () => makeResource()) as (typeof mcpHostAdapter)["readResource"]);
  const resourceOk = await readResourcePost(new Request("http://localhost/api/host/read-resource", { method: "POST", body: JSON.stringify({ resourceUri: "ui://stocks/chart" }) }));
  assert.equal(resourceOk.status, 200);

  const resourceBad = await readResourcePost(new Request("http://localhost/api/host/read-resource", { method: "POST", body: JSON.stringify({}) }));
  assert.equal(resourceBad.status, 400);
});

test("connect -> status -> callTool share the same active connection runtime state", async () => {
  restoreMethods();
  await mcpHostAdapter.disconnect();
  const originalFetch = global.fetch;
  const seenMethods: string[] = [];
  let initializeCount = 0;
  global.fetch = (async (_: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { id: string; method: string };
    seenMethods.push(payload.method);
    if (payload.method === "initialize") {
      initializeCount += 1;
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { serverInfo: { name: "Demo" } } }),
        { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-1" } },
      );
    }
    if (payload.method === "tools/call") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { content: [{ type: "text", text: "ok" }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;

  try {
    const connected = await connectPost(new Request("http://localhost/api/host/connect", { method: "POST", body: JSON.stringify({ type: "streamable-http", url: "http://localhost:3333/mcp" }) }));
    assert.equal(connected.status, 200);

    const status = await statusGet();
    assert.equal(status.status, 200);
    const statusPayload = (await status.json()) as { connection: { status: string; raw?: { hostRuntime?: { hasClientHandle?: boolean } } } };
    assert.equal(statusPayload.connection.status, "connected");
    assert.equal(statusPayload.connection.raw?.hostRuntime?.hasClientHandle, true);

    const run = await callToolPost(new Request("http://localhost/api/host/call-tool", { method: "POST", body: JSON.stringify({ toolName: "echo.text", args: { text: "hi" } }) }));
    assert.equal(run.status, 200);
    assert.deepEqual(seenMethods, ["initialize", "tools/call"]);
    assert.equal(initializeCount, 1);
  } finally {
    global.fetch = originalFetch;
    await mcpHostAdapter.disconnect();
  }
});

test("callTool reports structured NOT_CONNECTED diagnostics when no active connection exists", async () => {
  restoreMethods();
  await mcpHostAdapter.disconnect();
  const response = await callToolPost(new Request("http://localhost/api/host/call-tool", { method: "POST", body: JSON.stringify({ toolName: "echo.text", args: {} }) }));
  assert.equal(response.status, 500);
  const payload = (await response.json()) as {
    error: {
      code: string;
      details?: { hasClientHandle?: boolean; hasActiveConnectionRecord?: boolean; connection?: { raw?: { hostRuntime?: { initializationCompleted?: boolean } } } };
    };
  };
  assert.equal(payload.error.code, "NOT_CONNECTED");
  assert.equal(payload.error.details?.hasClientHandle, false);
  assert.equal(payload.error.details?.hasActiveConnectionRecord, true);
  assert.equal(payload.error.details?.connection?.raw?.hostRuntime?.initializationCompleted, false);
});
