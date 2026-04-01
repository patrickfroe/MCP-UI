import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { toolName?: string; args?: Record<string, unknown> };

    if (!body.toolName) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "toolName is required" } },
        { status: 400 },
      );
    }

    const run = await mcpHostAdapter.callTool(body.toolName, body.args ?? {});
    return NextResponse.json({ run });
  } catch (error) {
    const hostError = toMCPHostError(error, "TOOL_CALL_FAILED");
    if (hostError.code === "NOT_CONNECTED") {
      hostError.details = {
        ...(typeof hostError.details === "object" && hostError.details !== null ? hostError.details as Record<string, unknown> : {}),
        connection: mcpHostAdapter.status(),
      };
    }
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
