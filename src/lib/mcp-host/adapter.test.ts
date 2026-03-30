import test from "node:test";
import assert from "node:assert/strict";
import { MCPHostAdapter } from "@/lib/mcp-host/adapter";

test("listTools throws NOT_CONNECTED before connect", async () => {
  const adapter = new MCPHostAdapter();

  await assert.rejects(async () => adapter.listTools(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code?: string }).code, "NOT_CONNECTED");
    return true;
  });
});
