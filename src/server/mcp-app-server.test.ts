import test from "node:test";
import assert from "node:assert/strict";
import { APP_CSP, MCP_APP_RESOURCE_URI, MCPAppServerWrapper } from "@/server/mcp-app-server";

test("MCP app server wrapper keeps tool/resource URI consistent and exposes structuredContent", async () => {
  const server = new MCPAppServerWrapper();
  server.registerAppResource(async () => "<html></html>");
  server.registerAppTool(async (args) => ({
    content: [{ type: "text", text: "ok" }],
    structuredContent: { args, ok: true },
  }));

  const resource = await server.getResource();
  const tool = server.getToolDescriptor();
  const result = await server.callTool({ a: 1 });

  assert.equal(resource.uri, MCP_APP_RESOURCE_URI);
  assert.equal(tool._meta.ui.resourceUri, MCP_APP_RESOURCE_URI);
  assert.deepEqual(result.structuredContent, { args: { a: 1 }, ok: true });
  assert.deepEqual(APP_CSP, { resourceDomains: [], connectDomains: [], frameDomains: [] });
});
