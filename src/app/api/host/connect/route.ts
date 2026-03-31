import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";
import type { MCPServerConfig } from "@/lib/types";

function normalizeConfig(body: Record<string, unknown>): MCPServerConfig {
  if (body.type === "stdio") {
    return {
      type: "stdio",
      command: typeof body.command === "string" ? body.command : "",
      args: Array.isArray(body.args) ? body.args.filter((item): item is string => typeof item === "string") : [],
      cwd: typeof body.cwd === "string" ? body.cwd : undefined,
      env: body.env && typeof body.env === "object" ? Object.fromEntries(Object.entries(body.env).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")) : undefined,
      startupTimeoutMs: typeof body.startupTimeoutMs === "number" ? body.startupTimeoutMs : undefined,
      requestTimeoutMs: typeof body.requestTimeoutMs === "number" ? body.requestTimeoutMs : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
    };
  }

  const url = typeof body["url"] === "string" ? (body["url"] as string) : typeof body["baseUrl"] === "string" ? (body["baseUrl"] as string) : "http://localhost:3001/mcp";
  return {
    type: "streamable-http",
    url,
    headers: body["headers"] as Record<string, string> | undefined,
    authToken: body["authToken"] as string | undefined,
    requestTimeoutMs: typeof body.requestTimeoutMs === "number" ? body.requestTimeoutMs : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const connection = await mcpHostAdapter.connect(normalizeConfig(body));
    return NextResponse.json({ connection });
  } catch (error) {
    const hostError = toMCPHostError(error, "CONNECTION_FAILED");
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
