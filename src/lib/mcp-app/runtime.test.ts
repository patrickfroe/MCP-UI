import test from "node:test";
import assert from "node:assert/strict";
import { applyHostStyles, detectMCPAppMode, wireLifecycleHandlers } from "@/lib/mcp-app/runtime";
import { getPreferredResultData } from "@/lib/mcp-app/result-data";

test("detectMCPAppMode identifies mcp-app URL flags", () => {
  const win = {
    location: { href: "https://example.test/widget?mcp-app=1" },
    parent: {},
    __MCP_APP_MODE__: false,
  } as unknown as Window;
  assert.equal(detectMCPAppMode(win), "mcp-app");
});

test("wireLifecycleHandlers wires all handlers before connect", async () => {
  const events: string[] = [];
  const callbacks: Record<string, ((payload?: unknown) => void) | undefined> = {};
  const app = {
    ontoolinput: (handler: (payload: unknown) => void) => { callbacks.input = handler; },
    ontoolresult: (handler: (payload: unknown) => void) => { callbacks.result = handler; },
    onhostcontextchanged: (handler: (payload: unknown) => void) => { callbacks.host = handler; },
    onteardown: (handler: () => void) => { callbacks.teardown = handler; },
  };

  wireLifecycleHandlers(app, {
    ontoolinput: () => events.push("input"),
    ontoolresult: () => events.push("result"),
    onhostcontextchanged: () => events.push("host"),
    onteardown: () => events.push("teardown"),
  });

  callbacks.input?.({});
  callbacks.result?.({});
  callbacks.host?.({});
  callbacks.teardown?.();

  assert.deepEqual(events, ["input", "result", "host", "teardown"]);
});

test("getPreferredResultData prioritizes structuredContent", () => {
  assert.deepEqual(getPreferredResultData({ structuredContent: { value: 1 }, content: [{ type: "text", text: "fallback" }] }), { value: 1 });
  assert.deepEqual(getPreferredResultData({ content: [{ type: "text", text: "fallback" }] }), [{ type: "text", text: "fallback" }]);
});

test("applyHostStyles sets theme and safe-area aware styles", () => {
  const bodyStyle = {} as CSSStyleDeclaration;
  const rootStyle = {} as CSSStyleDeclaration;
  const doc = {
    body: { style: bodyStyle },
    documentElement: { style: rootStyle },
  } as unknown as Document;

  applyHostStyles(doc);
  assert.equal(bodyStyle.paddingTop.includes("safe-area"), true);
  assert.equal(rootStyle.colorScheme, "var(--mcp-host-color-scheme, light)");
});
