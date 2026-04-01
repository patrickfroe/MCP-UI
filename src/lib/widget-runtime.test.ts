import test from "node:test";
import assert from "node:assert/strict";
import { handleWidgetBridgeMessage, loadWidgetResource, sanitizeOpenLinkUrl } from "@/lib/widget-runtime";
import { makeResource } from "@/test-utils/fixtures";

test("loadWidgetResource returns text content for UI-capable resource", async () => {
  const text = await loadWidgetResource("ui://stocks/chart", async () => makeResource({ text: "<html>ok</html>" }));
  assert.equal(text, "<html>ok</html>");
});

test("loadWidgetResource fails for missing or unreadable content", async () => {
  await assert.rejects(() => loadWidgetResource("ui://stocks/chart", async () => makeResource({ text: undefined, blob: undefined })));
  await assert.rejects(() => loadWidgetResource("ui://broken", async () => {
    throw new Error("RESOURCE_READ_FAILED: boom");
  }));
});

test("widget bridge handles resource.read and tool.call callbacks", async () => {
  const calls: string[] = [];
  await handleWidgetBridgeMessage({ type: "resource.read", resourceUri: "ui://stocks/chart" }, {
    onReadResource: async (resourceUri) => {
      calls.push(`read:${resourceUri}`);
      return makeResource();
    },
    onCallTool: async () => ({}),
  });
  await handleWidgetBridgeMessage({ type: "tool.call", toolName: "echo.text", args: { text: "hello" } }, {
    onReadResource: async () => makeResource(),
    onCallTool: async (toolName, args) => {
      calls.push(`call:${toolName}:${JSON.stringify(args)}`);
      return { ok: true };
    },
  });
  assert.deepEqual(calls, ["read:ui://stocks/chart", 'call:echo.text:{"text":"hello"}']);
});

test("widget bridge ignores malformed messages and propagates callback failures", async () => {
  const events: string[] = [];
  await handleWidgetBridgeMessage({ type: "unknown" }, {
    onReadResource: async () => makeResource(),
    onCallTool: async () => ({}),
    onBridgeEvent: (event) => events.push(event),
  });
  assert.deepEqual(events, ["ignored-unknown-message"]);

  await assert.rejects(() => handleWidgetBridgeMessage({ type: "tool.call", toolName: "fail.tool" }, {
    onReadResource: async () => makeResource(),
    onCallTool: async () => {
      throw new Error("TOOL_CALL_FAILED");
    },
  }));
});

test("sanitizeOpenLinkUrl only allows http/https links", () => {
  assert.equal(sanitizeOpenLinkUrl("https://example.com"), "https://example.com/");
  assert.equal(sanitizeOpenLinkUrl("http://localhost:3001/path"), "http://localhost:3001/path");
  assert.equal(sanitizeOpenLinkUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeOpenLinkUrl("ui://stocks/chart"), null);
});
