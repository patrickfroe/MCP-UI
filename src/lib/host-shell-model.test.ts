import test from "node:test";
import assert from "node:assert/strict";
import { createRunHistoryItem, filterTools, getNextSelectionState, serializeFallbackResult } from "@/lib/host-shell-model";
import { makeTool, makeUiTool } from "@/test-utils/fixtures";

test("tool list filtering and selection state reset behavior", () => {
  const tools = [
    makeTool({ name: "echo.text", title: "Echo Text", description: "text utility" }),
    makeUiTool({ name: "stocks.chart", title: "Stock Chart", description: "chart ui", inputSchema: undefined }),
  ];

  assert.equal(filterTools(tools, "echo").length, 1);
  assert.equal(filterTools(tools, "chart").length, 1);
  assert.equal(filterTools(tools, "ui").length, 1);
  assert.equal(filterTools(tools, "").length, 2);

  const selected = getNextSelectionState(tools, "stocks.chart");
  assert.equal(selected.selectedToolName, "stocks.chart");
  assert.deepEqual(selected.args, {});

  const missing = getNextSelectionState(tools, "missing");
  assert.equal(missing.selectedToolName, null);
  assert.deepEqual(missing.args, {});
});

test("run history metadata includes tool name/status/timestamp/input summary", () => {
  const history = createRunHistoryItem({
    id: "run-1",
    toolName: "echo.text",
    status: "success",
    args: { text: "hello", locale: "en" },
    timestamp: "2026-03-30T00:00:00.000Z",
  });

  assert.equal(history.toolName, "echo.text");
  assert.equal(history.status, "success");
  assert.equal(history.timestamp, "2026-03-30T00:00:00.000Z");
  assert.ok(history.inputSummary.includes("text=\"hello\""));
});

test("fallback renderer serialization supports plain text/json/array/empty/unexpected", () => {
  assert.deepEqual(serializeFallbackResult("ok"), { pretty: "ok", raw: '"ok"' });
  assert.equal(serializeFallbackResult({ ok: true }).pretty.includes("\n"), true);
  assert.equal(serializeFallbackResult([1, 2]).raw, "[1,2]");
  assert.equal(serializeFallbackResult(undefined).pretty, "No result data returned.");

  const weird = {
    toString() {
      return "[custom]";
    },
  };
  assert.equal(serializeFallbackResult(weird).pretty.includes("custom") || serializeFallbackResult(weird).pretty.includes("{"), true);
});
