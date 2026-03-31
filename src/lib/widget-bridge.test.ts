import test from "node:test";
import assert from "node:assert/strict";
import { parseWidgetBridgeMessage } from "@/lib/widget-bridge";

test("parseWidgetBridgeMessage parses resource.read payloads", () => {
  const parsed = parseWidgetBridgeMessage({ type: "resource.read", resourceUri: "ui://stocks/chart" });
  assert.deepEqual(parsed, { kind: "resource.read", resourceUri: "ui://stocks/chart" });
});

test("parseWidgetBridgeMessage parses tool.call payloads and defaults args", () => {
  const parsed = parseWidgetBridgeMessage({ type: "tool.call", toolName: "stocks.quote", args: { ticker: "MSFT" } });
  assert.deepEqual(parsed, { kind: "tool.call", toolName: "stocks.quote", args: { ticker: "MSFT" } });

  const noArgs = parseWidgetBridgeMessage({ type: "tool.call", toolName: "stocks.quote" });
  assert.deepEqual(noArgs, { kind: "tool.call", toolName: "stocks.quote", args: {} });
});

test("parseWidgetBridgeMessage ignores malformed payloads", () => {
  assert.equal(parseWidgetBridgeMessage(null), null);
  assert.equal(parseWidgetBridgeMessage({ type: "resource.read", resourceUri: "" }), null);
  assert.equal(parseWidgetBridgeMessage({ type: "tool.call", toolName: "" }), null);
  assert.equal(parseWidgetBridgeMessage({ type: "unknown" }), null);
});
