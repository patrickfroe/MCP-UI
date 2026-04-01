import { readFile } from "node:fs/promises";

export const MCP_APP_RESOURCE_URI = "ui://mcp-ui-host/mcp-app";

export const APP_CSP = {
  resourceDomains: [] as string[],
  connectDomains: [] as string[],
  frameDomains: [] as string[],
};

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown> }>;
type ResourceLoader = () => Promise<string>;

export class MCPAppServerWrapper {
  private toolHandler?: ToolHandler;
  private resourceLoader?: ResourceLoader;

  registerAppResource(loader: ResourceLoader) {
    this.resourceLoader = loader;
  }

  registerAppTool(handler: ToolHandler) {
    this.toolHandler = handler;
  }

  async getResource() {
    if (!this.resourceLoader) throw new Error("App resource not registered");
    return {
      uri: MCP_APP_RESOURCE_URI,
      mimeType: "text/html",
      text: await this.resourceLoader(),
      _meta: {
        csp: APP_CSP,
      },
    };
  }

  getToolDescriptor() {
    return {
      name: "mcp_app.host_status",
      title: "MCP App Host Status",
      description: "Returns host status and renders in MCP App mode.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional note" },
        },
      },
      _meta: {
        ui: {
          resourceUri: MCP_APP_RESOURCE_URI,
        },
      },
    };
  }

  async callTool(args: Record<string, unknown>) {
    if (!this.toolHandler) throw new Error("App tool not registered");
    return this.toolHandler(args);
  }
}

export async function createMCPAppServer() {
  const server = new MCPAppServerWrapper();

  server.registerAppResource(async () => readFile("dist/mcp-app.html", "utf8"));

  server.registerAppTool(async (args) => ({
    content: [{ type: "text", text: "MCP app tool executed." }],
    structuredContent: {
      ok: true,
      received: args,
      renderedAt: new Date().toISOString(),
    },
  }));

  return server;
}
