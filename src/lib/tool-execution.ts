import type { MCPToolDescriptor, MCPToolRun } from "@/lib/types";

export type SupportedSchemaType = "string" | "number" | "integer" | "boolean" | "array" | "object";

export interface ToolFieldSchema {
  type?: SupportedSchemaType;
  title?: string;
  description?: string;
  enum?: Array<string | number>;
  default?: unknown;
  items?: { type?: "string" | "number" | "integer" | "boolean" };
}

export interface ToolInputSchemaShape {
  type?: string;
  properties?: Record<string, ToolFieldSchema>;
  required?: string[];
}

export interface FormField {
  name: string;
  schema: ToolFieldSchema;
  required: boolean;
}

export function isUiCapableTool(tool?: MCPToolDescriptor | null): tool is MCPToolDescriptor & { uiBinding: { resourceUri: string } } {
  return Boolean(tool?.uiBinding?.resourceUri);
}

export function getInputFields(tool?: MCPToolDescriptor | null): FormField[] {
  const schema = tool?.inputSchema as ToolInputSchemaShape | undefined;
  const properties = schema?.properties ?? {};
  const requiredSet = new Set(schema?.required ?? []);

  return Object.entries(properties).map(([name, fieldSchema]) => ({
    name,
    schema: fieldSchema,
    required: requiredSet.has(name),
  }));
}

export function buildInitialArgs(tool?: MCPToolDescriptor | null): Record<string, unknown> {
  const fields = getInputFields(tool);

  return Object.fromEntries(
    fields.map(({ name, schema }) => {
      if (schema.default !== undefined) {
        return [name, schema.default];
      }

      if (schema.enum?.length) {
        return [name, schema.enum[0]];
      }

      switch (schema.type) {
        case "boolean":
          return [name, false];
        case "number":
        case "integer":
          return [name, ""];
        case "array":
          return [name, ""];
        case "object":
          return [name, "{}"];
        case "string":
        default:
          return [name, ""];
      }
    }),
  );
}

export function coerceArgsForSubmission(tool: MCPToolDescriptor, args: Record<string, unknown>): Record<string, unknown> {
  const fields = getInputFields(tool);
  const coerced: Record<string, unknown> = {};

  for (const field of fields) {
    const value = args[field.name];
    if (value === undefined || value === "") {
      continue;
    }

    if (field.schema.enum?.length) {
      coerced[field.name] = value;
      continue;
    }

    switch (field.schema.type) {
      case "integer": {
        const numberValue = typeof value === "number" ? value : Number(value);
        coerced[field.name] = Number.isNaN(numberValue) ? value : Math.trunc(numberValue);
        break;
      }
      case "number": {
        const numberValue = typeof value === "number" ? value : Number(value);
        coerced[field.name] = Number.isNaN(numberValue) ? value : numberValue;
        break;
      }
      case "boolean":
        coerced[field.name] = Boolean(value);
        break;
      case "array":
      case "object": {
        if (typeof value === "string") {
          try {
            coerced[field.name] = JSON.parse(value);
          } catch {
            coerced[field.name] = value;
          }
        } else {
          coerced[field.name] = value;
        }
        break;
      }
      default:
        coerced[field.name] = value;
    }
  }

  return coerced;
}

export function validateToolArgs(tool: MCPToolDescriptor, args: Record<string, unknown>): string[] {
  const fields = getInputFields(tool);
  const errors: string[] = [];

  for (const field of fields) {
    const value = args[field.name];

    if (field.required && (value === undefined || value === "")) {
      errors.push(`${field.name} is required.`);
      continue;
    }

    if (value === undefined || value === "") {
      continue;
    }

    if (field.schema.type === "number" || field.schema.type === "integer") {
      const numeric = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(numeric)) {
        errors.push(`${field.name} must be a valid number.`);
      }
      if (field.schema.type === "integer" && !Number.isInteger(numeric)) {
        errors.push(`${field.name} must be an integer.`);
      }
    }

    if ((field.schema.type === "array" || field.schema.type === "object") && typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (field.schema.type === "array" && !Array.isArray(parsed)) {
          errors.push(`${field.name} must be a JSON array.`);
        }
        if (field.schema.type === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object")) {
          errors.push(`${field.name} must be a JSON object.`);
        }
      } catch {
        errors.push(`${field.name} must be valid JSON.`);
      }
    }
  }

  return errors;
}

export function buildInputSummary(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (!keys.length) {
    return "No input";
  }

  const preview = keys.slice(0, 3).map((key) => `${key}=${JSON.stringify(args[key])}`);
  const suffix = keys.length > 3 ? ` +${keys.length - 3} more` : "";
  return `${preview.join(", ")}${suffix}`;
}

export function shouldRenderWidget(tool: MCPToolDescriptor | null, run: MCPToolRun | null): boolean {
  return Boolean(tool && isUiCapableTool(tool) && run && run.succeeded && run.toolName === tool.name);
}

export function getLatestRunForTool(runs: MCPToolRun[], toolName?: string | null): MCPToolRun | null {
  if (!toolName) {
    return null;
  }
  return runs.find((run) => run.toolName === toolName) ?? null;
}
