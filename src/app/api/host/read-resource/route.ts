import { NextResponse } from "next/server";
import { mcpHostAdapter } from "@/lib/mcp-host/adapter";
import { toMCPHostError } from "@/lib/mcp-host/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { resourceUri?: string };

    if (!body.resourceUri) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "resourceUri is required" } },
        { status: 400 },
      );
    }

    const resource = await mcpHostAdapter.readResource(body.resourceUri);
    return NextResponse.json(resource);
  } catch (error) {
    const hostError = toMCPHostError(error, "RESOURCE_READ_FAILED");
    return NextResponse.json({ error: hostError }, { status: 500 });
  }
}
