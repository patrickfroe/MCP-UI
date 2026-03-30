import { NextResponse } from "next/server";
import { mcpHostStore } from "@/lib/mcp-host-store";

export async function GET() {
  const connection = mcpHostStore.status();
  return NextResponse.json({ connection });
}
