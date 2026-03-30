import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTool } from "@/lib/mcp-host/normalizers";

test("normalizeTool maps tool fields and ui.resourceUri binding", () => {
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
});

test("normalizeTool returns null without a valid name", () => {
  const normalized = normalizeTool({ title: "Missing name" });
  assert.equal(normalized, null);
});
