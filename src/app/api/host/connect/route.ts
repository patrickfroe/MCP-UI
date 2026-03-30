import { NextResponse } from "next/server";
import { mcpHostStore } from "@/lib/mcp-host-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { baseUrl?: string };
  const baseUrl = body.baseUrl?.trim() || "http://localhost:3001/mcp";
  const connection = mcpHostStore.connect(baseUrl);
  return NextResponse.json({ connection });
}
