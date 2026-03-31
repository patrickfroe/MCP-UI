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
