import { NextResponse } from "next/server";
import { mcpHostStore } from "@/lib/mcp-host-store";

export async function POST(request: Request) {
  const body = (await request.json()) as { resourceUri?: string };

  if (!body.resourceUri) {
    return NextResponse.json({ message: "resourceUri is required" }, { status: 400 });
  }

  try {
    const contents = mcpHostStore.readResource(body.resourceUri);
    return NextResponse.json({ resourceUri: body.resourceUri, contents });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Resource read failed" },
      { status: 404 },
    );
  }
}
