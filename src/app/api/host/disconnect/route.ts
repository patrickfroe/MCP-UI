import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";

export async function POST() {
  try {
    const connection = await mcpHostAdapter.disconnect();
    return NextResponse.json({ connection });
  } catch (error) {
    const hostError = toMCPHostError(error, "INTERNAL_ERROR");
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
