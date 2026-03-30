import type { MCPHostError, MCPResourceContents, MCPToolDescriptor, MCPToolRun } from "@/lib/types";

export function makeTool(overrides: Partial<MCPToolDescriptor> = {}): MCPToolDescriptor {
  return {
    name: "echo.text",
    title: "Echo",
    description: "Echoes the provided text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", title: "Text" },
      },
      required: ["text"],
    },
    ...overrides,
  };
}

export function makeUiTool(overrides: Partial<MCPToolDescriptor> = {}): MCPToolDescriptor {
  return makeTool({
    name: "stocks.chart",
    title: "Stock chart",
    uiBinding: {
      resourceUri: "ui://stocks/chart",
    },
    ...overrides,
  });
}

export function makeRun(overrides: Partial<MCPToolRun> = {}): MCPToolRun {
  return {
    id: "run-1",
    toolName: "echo.text",
    args: { text: "hello" },
    result: { content: [{ type: "text", text: "hello" }] },
    succeeded: true,
    createdAt: "2026-03-30T00:00:00.000Z",
    ...overrides,
  };
}

export function makeResource(overrides: Partial<MCPResourceContents> = {}): MCPResourceContents {
  return {
    resourceUri: "ui://stocks/chart",
    mimeType: "text/html",
    text: "<html></html>",
    ...overrides,
  };
}

export function makeHostError(overrides: Partial<MCPHostError> = {}): MCPHostError {
  return {
    code: "MCP_PROTOCOL_ERROR",
    message: "upstream exploded",
    ...overrides,
  };
}
