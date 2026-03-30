import { NextResponse } from "next/server";
import { mcpHostStore } from "@/lib/mcp-host-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { toolName?: string; args?: Record<string, unknown> };

  if (!body.toolName) {
    return NextResponse.json({ message: "toolName is required" }, { status: 400 });
  }

  const run = mcpHostStore.callTool(body.toolName, body.args ?? {});
  return NextResponse.json({ run });
}
