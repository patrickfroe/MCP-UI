import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResource, normalizeTool, normalizeToolRun, normalizeTools } from "@/lib/mcp-host/normalizers";

test("normalizeTool maps descriptor and ui resource bindings", () => {
  const normalized = normalizeTool({
    name: "stocks.chart",
    title: "Stock Chart",
    description: "Shows a stock chart",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    _meta: {
      ui: {
        resourceUri: "ui://stocks/chart",
      },
    },
  });

  assert.ok(normalized);
  assert.equal(normalized.name, "stocks.chart");
  assert.equal(normalized.uiBinding?.resourceUri, "ui://stocks/chart");
  assert.deepEqual(normalized.inputSchema?.required, ["ticker"]);
  assert.equal(normalized.inputSchema?.additionalProperties, false);
});

test("normalizeTool ignores malformed metadata and missing schema", () => {
  const normalized = normalizeTool({
    name: "stocks.quote",
    _meta: { ui: { resourceUri: 42 } },
    inputSchema: "invalid",
  });

  assert.ok(normalized);
  assert.equal(normalized.uiBinding, undefined);
  assert.equal(normalized.inputSchema, undefined);
});

test("normalizeTool returns null for malformed descriptors", () => {
  assert.equal(normalizeTool({ title: "Missing name" }), null);
  assert.equal(normalizeTool("bad"), null);
});

test("normalizeTools filters invalid entries", () => {
  const tools = normalizeTools([{ name: "ok.tool" }, { title: "bad" }, null]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, "ok.tool");
});

test("normalizeToolRun and normalizeResource return normalized transport-safe shape", () => {
  const run = normalizeToolRun("echo.text", { text: "hello" }, { content: [{ type: "text", text: "hello" }] });
  assert.equal(run.toolName, "echo.text");
  assert.equal(run.succeeded, true);
  assert.ok(run.id.length > 0);

  const resource = normalizeResource("ui://stocks/chart", {
    contents: [{ mimeType: "text/html", text: "<html>widget</html>" }],
  });

  assert.equal(resource.resourceUri, "ui://stocks/chart");
  assert.equal(resource.mimeType, "text/html");
  assert.equal(resource.text, "<html>widget</html>");
});

test("normalizeResource tolerates malformed upstream payload", () => {
  const resource = normalizeResource("ui://x", { hello: "world" });
  assert.equal(resource.resourceUri, "ui://x");
  assert.equal(resource.text, undefined);
  assert.equal(resource.blob, undefined);
});
