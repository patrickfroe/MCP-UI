import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { baseUrl?: string };
    const baseUrl = body.baseUrl?.trim() || "http://localhost:3001/mcp";
    const connection = await mcpHostAdapter.connect(baseUrl);
    return NextResponse.json({ connection });
  } catch (error) {
    const hostError = toMCPHostError(error, "CONNECTION_FAILED");
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
