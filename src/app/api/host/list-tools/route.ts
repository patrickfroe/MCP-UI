import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";

export async function GET() {
  try {
    const tools = await mcpHostAdapter.listTools();
    return NextResponse.json({ tools });
  } catch (error) {
    const hostError = toMCPHostError(error, "MCP_PROTOCOL_ERROR");
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
