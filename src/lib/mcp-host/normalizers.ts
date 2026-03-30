import type { MCPResourceContents, MCPToolDescriptor, MCPToolInputSchema, MCPToolRun, MCPToolUIBinding } from "@/lib/types";

interface RawTool {
  name?: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: {
    ui?: {
      resourceUri?: string;
    };
  };
}

function normalizeInputSchema(raw: unknown): MCPToolInputSchema | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const schema = raw as Record<string, unknown>;
  const properties = (schema.properties && typeof schema.properties === "object"
    ? (schema.properties as Record<string, Record<string, unknown>>)
    : undefined);

  return {
    type: typeof schema.type === "string" ? schema.type : undefined,
    properties,
    required: Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : undefined,
    additionalProperties: typeof schema.additionalProperties === "boolean" ? schema.additionalProperties : undefined,
    raw,
  };
}

export function normalizeTool(raw: unknown): MCPToolDescriptor | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const tool = raw as RawTool;
  if (!tool.name || typeof tool.name !== "string") {
    return null;
  }

  const uiBinding: MCPToolUIBinding | undefined = tool._meta?.ui?.resourceUri
    ? { resourceUri: tool._meta.ui.resourceUri }
    : undefined;

  return {
    name: tool.name,
    title: typeof tool.title === "string" ? tool.title : undefined,
    description: typeof tool.description === "string" ? tool.description : undefined,
    inputSchema: normalizeInputSchema(tool.inputSchema),
    uiBinding,
    raw,
  };
}

export function normalizeTools(rawTools: unknown): MCPToolDescriptor[] {
  if (!Array.isArray(rawTools)) {
    return [];
  }

  return rawTools.map(normalizeTool).filter((tool): tool is MCPToolDescriptor => Boolean(tool));
}

export function normalizeToolRun(toolName: string, args: Record<string, unknown>, raw: unknown): MCPToolRun {
  return {
    id: crypto.randomUUID(),
    toolName,
    args,
    result: raw,
    succeeded: true,
    createdAt: new Date().toISOString(),
    raw,
  };
}

export function normalizeResource(resourceUri: string, raw: unknown): MCPResourceContents {
  const resourceLike = raw as
    | {
        contents?: Array<{
          mimeType?: string;
          text?: string;
          blob?: string;
        }>;
      }
    | undefined;

  const first = resourceLike?.contents?.[0];

  return {
    resourceUri,
    mimeType: first?.mimeType,
    text: first?.text,
    blob: first?.blob,
    raw,
  };
}
