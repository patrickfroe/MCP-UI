import { NextResponse } from "next/server";
import { mcpHostStore } from "@/lib/mcp-host-store";

export async function GET() {
  const tools = mcpHostStore.listTools();
  return NextResponse.json({ tools });
}
