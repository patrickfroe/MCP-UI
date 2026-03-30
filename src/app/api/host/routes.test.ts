import test from "node:test";
import assert from "node:assert/strict";
import { POST as connectPost } from "@/app/api/host/connect/route";
import { GET as statusGet } from "@/app/api/host/status/route";
import { GET as listToolsGet } from "@/app/api/host/list-tools/route";
import { POST as callToolPost } from "@/app/api/host/call-tool/route";
import { POST as readResourcePost } from "@/app/api/host/read-resource/route";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { MCPAdapterError } from "@/lib/mcp-host/errors";
import { makeResource, makeRun, makeTool } from "@/test-utils/fixtures";

type AdapterMethod = "connect" | "status" | "listTools" | "callTool" | "readResource";

const originals: Partial<Record<AdapterMethod, unknown>> = {};

function stubMethod<K extends AdapterMethod>(name: K, fn: (typeof mcpHostAdapter)[K]) {
  if (!(name in originals)) {
    originals[name] = mcpHostAdapter[name];
  }
  (mcpHostAdapter[name] as unknown) = fn;
}

function restoreMethods() {
  for (const name of Object.keys(originals) as AdapterMethod[]) {
    (mcpHostAdapter[name] as unknown) = originals[name] as (typeof mcpHostAdapter)[typeof name];
  }
}

test.afterEach(() => {
  restoreMethods();
});

test("connect endpoint success and failure path", async () => {
  stubMethod("connect", (async (baseUrl: string) => ({
    id: "single-server",
    name: "Configured MCP Server",
    transport: "streamable-http",
    baseUrl,
    status: "connected",
  })) as (typeof mcpHostAdapter)["connect"]);

  const ok = await connectPost(new Request("http://localhost/api/host/connect", {
    method: "POST",
    body: JSON.stringify({ baseUrl: "http://localhost:3333/mcp" }),
  }));
  assert.equal(ok.status, 200);
  const okPayload = (await ok.json()) as { connection: { baseUrl: string } };
  assert.equal(okPayload.connection.baseUrl, "http://localhost:3333/mcp");

  stubMethod("connect", (async () => {
    throw new MCPAdapterError("CONNECTION_FAILED", "connect failed");
  }) as (typeof mcpHostAdapter)["connect"]);

  const fail = await connectPost(new Request("http://localhost/api/host/connect", {
    method: "POST",
    body: JSON.stringify({ baseUrl: "http://localhost:9999/mcp" }),
  }));
  assert.equal(fail.status, 500);
  const failPayload = (await fail.json()) as { error: { code: string } };
  assert.equal(failPayload.error.code, "CONNECTION_FAILED");
});

test("status/listTools endpoints return normalized shapes and map malformed upstream response", async () => {
  stubMethod("status", (() => ({
    id: "single-server",
    name: "Configured MCP Server",
    transport: "streamable-http",
    baseUrl: "http://localhost:3001/mcp",
    status: "connected",
  })) as (typeof mcpHostAdapter)["status"]);

  const status = await statusGet();
  assert.equal(status.status, 200);
  const statusPayload = (await status.json()) as { connection: { status: string } };
  assert.equal(statusPayload.connection.status, "connected");

  stubMethod("listTools", (async () => [makeTool({ raw: { hidden: true } })]) as (typeof mcpHostAdapter)["listTools"]);
  const list = await listToolsGet();
  const listPayload = (await list.json()) as { tools: Array<{ name: string; raw?: unknown }> };
  assert.equal(list.status, 200);
  assert.equal(listPayload.tools[0]?.name, "echo.text");

  stubMethod("listTools", (async () => {
    throw new MCPAdapterError("MCP_PROTOCOL_ERROR", "bad upstream");
  }) as (typeof mcpHostAdapter)["listTools"]);

  const listFail = await listToolsGet();
  assert.equal(listFail.status, 500);
  const listFailPayload = (await listFail.json()) as { error: { code: string } };
  assert.equal(listFailPayload.error.code, "MCP_PROTOCOL_ERROR");
});

test("callTool endpoint success, bad request, and error paths", async () => {
  stubMethod("callTool", (async (toolName: string, args: Record<string, unknown>) => makeRun({ toolName, args })) as (typeof mcpHostAdapter)["callTool"]);

  const ok = await callToolPost(new Request("http://localhost/api/host/call-tool", {
    method: "POST",
    body: JSON.stringify({ toolName: "echo.text", args: { text: "hi" } }),
  }));
  assert.equal(ok.status, 200);
  const okPayload = (await ok.json()) as { run: { toolName: string; args: Record<string, unknown> } };
  assert.equal(okPayload.run.toolName, "echo.text");
  assert.deepEqual(okPayload.run.args, { text: "hi" });

  const bad = await callToolPost(new Request("http://localhost/api/host/call-tool", {
    method: "POST",
    body: JSON.stringify({ args: {} }),
  }));
  assert.equal(bad.status, 400);

  stubMethod("callTool", (async () => {
    throw new MCPAdapterError("TOOL_CALL_FAILED", "tool fail");
  }) as (typeof mcpHostAdapter)["callTool"]);

  const fail = await callToolPost(new Request("http://localhost/api/host/call-tool", {
    method: "POST",
    body: JSON.stringify({ toolName: "echo.text", args: {} }),
  }));
  assert.equal(fail.status, 500);
  const failPayload = (await fail.json()) as { error: { code: string } };
  assert.equal(failPayload.error.code, "TOOL_CALL_FAILED");
});

test("readResource endpoint success, bad request, and error paths", async () => {
  stubMethod("readResource", (async () => makeResource()) as (typeof mcpHostAdapter)["readResource"]);

  const ok = await readResourcePost(new Request("http://localhost/api/host/read-resource", {
    method: "POST",
    body: JSON.stringify({ resourceUri: "ui://stocks/chart" }),
  }));
  assert.equal(ok.status, 200);
  const okPayload = (await ok.json()) as { resourceUri: string; text?: string };
  assert.equal(okPayload.resourceUri, "ui://stocks/chart");
  assert.equal(okPayload.text, "<html></html>");

  const bad = await readResourcePost(new Request("http://localhost/api/host/read-resource", {
    method: "POST",
    body: JSON.stringify({}),
  }));
  assert.equal(bad.status, 400);

  stubMethod("readResource", (async () => {
    throw new MCPAdapterError("RESOURCE_READ_FAILED", "resource fail");
  }) as (typeof mcpHostAdapter)["readResource"]);

  const fail = await readResourcePost(new Request("http://localhost/api/host/read-resource", {
    method: "POST",
    body: JSON.stringify({ resourceUri: "ui://stocks/chart" }),
  }));
  assert.equal(fail.status, 500);
  const failPayload = (await fail.json()) as { error: { code: string } };
  assert.equal(failPayload.error.code, "RESOURCE_READ_FAILED");
});
