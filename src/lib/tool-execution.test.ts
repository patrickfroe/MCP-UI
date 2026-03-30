import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitialArgs,
  coerceArgsForSubmission,
  getInputFields,
  getLatestRunForTool,
  isUiCapableTool,
  shouldRenderWidget,
  validateToolArgs,
} from "@/lib/tool-execution";
import { makeRun, makeTool, makeUiTool } from "@/test-utils/fixtures";

const schemaTool = makeTool({
  name: "weather.get",
  inputSchema: {
    type: "object",
    required: ["city", "days"],
    properties: {
      city: { type: "string", default: "Seattle" },
      days: { type: "integer" },
      ratio: { type: "number" },
      includeHourly: { type: "boolean", default: true },
      units: { type: "string", enum: ["metric", "imperial"] },
      tags: { type: "array" },
      config: { type: "object" },
    },
  },
});

test("schema-to-form mapping handles required/default/enum and empty schema", () => {
  const fields = getInputFields(schemaTool);
  assert.equal(fields.length, 7);
  assert.equal(fields.find((f) => f.name === "city")?.required, true);

  const initial = buildInitialArgs(schemaTool);
  assert.equal(initial.city, "Seattle");
  assert.equal(initial.units, "metric");
  assert.equal(initial.includeHourly, true);

  assert.deepEqual(getInputFields(makeTool({ inputSchema: undefined })), []);
  assert.deepEqual(buildInitialArgs(makeTool({ inputSchema: undefined })), {});
});

test("coercion and validation cover string/number/integer/boolean/enum/object/array", () => {
  const coerced = coerceArgsForSubmission(schemaTool, {
    city: "SEA",
    days: "5",
    ratio: "2.5",
    includeHourly: true,
    units: "imperial",
    tags: '["a","b"]',
    config: '{"foo":1}',
  });

  assert.equal(coerced.days, 5);
  assert.equal(coerced.ratio, 2.5);
  assert.deepEqual(coerced.tags, ["a", "b"]);
  assert.deepEqual(coerced.config, { foo: 1 });
  assert.equal(coerced.units, "imperial");

  const errors = validateToolArgs(schemaTool, {
    city: "",
    days: "abc",
    tags: "not-json",
    config: "[]",
  });

  assert.ok(errors.includes("city is required."));
  assert.ok(errors.includes("days must be a valid number."));
  assert.ok(errors.includes("tags must be valid JSON."));
  assert.ok(errors.includes("config must be a JSON object."));
});

test("ui-capable/widget path and latest-run selection are deterministic", () => {
  const uiTool = makeUiTool();
  const nonUiTool = makeTool({ uiBinding: undefined });

  const successRun = makeRun({ toolName: uiTool.name, succeeded: true });
  const failedRun = makeRun({ toolName: uiTool.name, succeeded: false });

  assert.equal(isUiCapableTool(uiTool), true);
  assert.equal(isUiCapableTool(nonUiTool), false);

  assert.equal(shouldRenderWidget(uiTool, successRun), true);
  assert.equal(shouldRenderWidget(nonUiTool, successRun), false);
  assert.equal(shouldRenderWidget(uiTool, failedRun), false);

  const runs = [
    makeRun({ id: "1", toolName: "tool.a" }),
    makeRun({ id: "2", toolName: "tool.b" }),
    makeRun({ id: "3", toolName: "tool.a" }),
  ];
  assert.equal(getLatestRunForTool(runs, "tool.a")?.id, "1");
  assert.equal(getLatestRunForTool(runs, "tool.c"), null);
});
