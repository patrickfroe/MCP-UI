import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitialArgs,
  coerceArgsForSubmission,
  getInputFields,
  isUiCapableTool,
  shouldRenderWidget,
  validateToolArgs,
} from "@/lib/tool-execution";
import type { MCPToolDescriptor, MCPToolRun } from "@/lib/types";

const schemaTool: MCPToolDescriptor = {
  name: "weather.get",
  inputSchema: {
    type: "object",
    required: ["city", "days"],
    properties: {
      city: { type: "string", default: "Seattle" },
      days: { type: "integer" },
      includeHourly: { type: "boolean", default: true },
      units: { type: "string", enum: ["metric", "imperial"] },
      tags: { type: "array" },
    },
  },
};

test("schema-to-form mapping handles defaults, required fields, and enums", () => {
  const fields = getInputFields(schemaTool);
  const cityField = fields.find((field) => field.name === "city");
  const unitsField = fields.find((field) => field.name === "units");

  assert.equal(cityField?.required, true);
  assert.deepEqual(unitsField?.schema.enum, ["metric", "imperial"]);

  const initial = buildInitialArgs(schemaTool);
  assert.equal(initial.city, "Seattle");
  assert.equal(initial.includeHourly, true);
  assert.equal(initial.units, "metric");
});

test("UI-capable vs non-UI tool rendering path is deterministic", () => {
  const uiTool: MCPToolDescriptor = {
    name: "stocks.chart",
    uiBinding: { resourceUri: "ui://stocks/chart" },
  };

  const nonUiTool: MCPToolDescriptor = {
    name: "stocks.quote",
  };

  const successRun: MCPToolRun = {
    id: "run_1",
    toolName: "stocks.chart",
    args: {},
    result: { ok: true },
    succeeded: true,
    createdAt: new Date().toISOString(),
  };

  assert.equal(isUiCapableTool(uiTool), true);
  assert.equal(isUiCapableTool(nonUiTool), false);
  assert.equal(shouldRenderWidget(uiTool, successRun), true);
  assert.equal(shouldRenderWidget(nonUiTool, successRun), false);
});

test("execution error path validation catches bad number/integer input", () => {
  const errors = validateToolArgs(schemaTool, {
    city: "Seattle",
    days: "abc",
  });

  assert.ok(errors.some((message) => message.includes("days must be a valid number.")));
});

test("widget failure fallback path keeps widget hidden when run is not successful", () => {
  const uiTool: MCPToolDescriptor = {
    name: "stocks.chart",
    uiBinding: { resourceUri: "ui://stocks/chart" },
  };

  const failedRun: MCPToolRun = {
    id: "run_2",
    toolName: "stocks.chart",
    args: {},
    result: { error: "boom" },
    succeeded: false,
    createdAt: new Date().toISOString(),
  };

  assert.equal(shouldRenderWidget(uiTool, failedRun), false);
});

test("submission coercion parses numeric and JSON payloads", () => {
  const parsed = coerceArgsForSubmission(schemaTool, {
    city: "Seattle",
    days: "5",
    includeHourly: true,
    tags: '["a","b"]',
  });

  assert.equal(parsed.days, 5);
  assert.deepEqual(parsed.tags, ["a", "b"]);
});
