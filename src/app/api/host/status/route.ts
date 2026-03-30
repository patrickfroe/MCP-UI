import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";

export async function GET() {
  const connection = mcpHostAdapter.status();
  return NextResponse.json({ connection });
}
