import type { MCPServerConnection, MCPToolDescriptor, MCPToolRun } from "@/lib/types";

const defaultConnection: MCPServerConnection = {
  id: "local-default",
  name: "Local MCP Server",
  transport: "streamable-http",
  baseUrl: "http://localhost:3001/mcp",
  connected: false,
};

const sampleTools: MCPToolDescriptor[] = [
  {
    name: "weather.lookup",
    title: "Weather Lookup",
    description: "Get weather data for a city.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", title: "City" },
        units: { type: "string", enum: ["metric", "imperial"], default: "metric" },
      },
      required: ["city"],
    },
  },
  {
    name: "stocks.chart",
    title: "Stock Chart Widget",
    description: "Returns stock data and embeddable chart widget.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", title: "Ticker" },
      },
      required: ["ticker"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://stocks/chart-widget",
      },
    },
  },
];

const runs: MCPToolRun[] = [];
let connection = defaultConnection;

export const mcpHostStore = {
  connect(baseUrl: string): MCPServerConnection {
    connection = {
      ...connection,
      baseUrl,
      connected: true,
      connectedAt: new Date().toISOString(),
    };
    return connection;
  },

  status(): MCPServerConnection {
    return connection;
  },

  listTools(): MCPToolDescriptor[] {
    return sampleTools;
  },

  callTool(toolName: string, args: Record<string, unknown>): MCPToolRun {
    const run: MCPToolRun = {
      id: crypto.randomUUID(),
      toolName,
      args,
      succeeded: true,
      createdAt: new Date().toISOString(),
      result: {
        type: "json",
        message: "Placeholder host API response",
        data: { toolName, args },
      },
    };
    runs.unshift(run);
    return run;
  },

  listRuns(): MCPToolRun[] {
    return runs;
  },

  readResource(resourceUri: string): string {
    if (resourceUri === "ui://stocks/chart-widget") {
      return JSON.stringify({
        kind: "mcp-ui-resource",
        version: 1,
        source: "placeholder",
        resourceUri,
      });
    }
    throw new Error(`Resource not found: ${resourceUri}`);
  },
};
