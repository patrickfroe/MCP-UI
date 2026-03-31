import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";
import type { MCPServerConfig } from "@/lib/types";
import { MCPAdapterError } from "@/lib/mcp-host/errors";

function parseTimeout(value: unknown, field: "startupTimeoutMs" | "requestTimeoutMs") {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new MCPAdapterError("BAD_REQUEST", `${field} must be a positive number.`);
  }
  return value;
}

function normalizeConfig(body: Record<string, unknown>): MCPServerConfig {
  if (body.type === "stdio") {
    if (body.command !== undefined && typeof body.command !== "string") {
      throw new MCPAdapterError("BAD_REQUEST", "command must be a string for stdio transport.");
    }
    if (body.args !== undefined && (!Array.isArray(body.args) || body.args.some((arg) => typeof arg !== "string"))) {
      throw new MCPAdapterError("BAD_REQUEST", "args must be an array of strings for stdio transport.");
    }
    if (body.env !== undefined && (typeof body.env !== "object" || body.env === null || Array.isArray(body.env))) {
      throw new MCPAdapterError("BAD_REQUEST", "env must be an object map of string values for stdio transport.");
    }
    return {
      type: "stdio",
      command: typeof body.command === "string" ? body.command : "",
      args: Array.isArray(body.args) ? body.args.filter((item): item is string => typeof item === "string") : [],
      cwd: typeof body.cwd === "string" ? body.cwd : undefined,
      env: body.env && typeof body.env === "object" ? Object.fromEntries(Object.entries(body.env).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")) : undefined,
      startupTimeoutMs: parseTimeout(body.startupTimeoutMs, "startupTimeoutMs"),
      requestTimeoutMs: parseTimeout(body.requestTimeoutMs, "requestTimeoutMs"),
      name: typeof body.name === "string" ? body.name : undefined,
    };
  }

  const url = typeof body["url"] === "string" ? (body["url"] as string) : typeof body["baseUrl"] === "string" ? (body["baseUrl"] as string) : "http://localhost:3001/mcp";
  return {
    type: "streamable-http",
    url,
    headers: body["headers"] as Record<string, string> | undefined,
    authToken: body["authToken"] as string | undefined,
    requestTimeoutMs: parseTimeout(body.requestTimeoutMs, "requestTimeoutMs"),
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
    return NextResponse.json({ error: hostError }, { status: hostError.code === "BAD_REQUEST" ? 400 : 500 });
  }
}
