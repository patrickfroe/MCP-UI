import type { MCPHostError } from "@/lib/types";

export class MCPAdapterError extends Error implements MCPHostError {
  code: MCPHostError["code"];
  details?: unknown;

  constructor(code: MCPHostError["code"], message: string, details?: unknown) {
    super(message);
    this.name = "MCPAdapterError";
    this.code = code;
    this.details = details;
  }

  toJSON(): MCPHostError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function toMCPHostError(error: unknown, fallbackCode: MCPHostError["code"]): MCPHostError {
  if (error instanceof MCPAdapterError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
      details: { name: error.name },
    };
  }

  return {
    code: fallbackCode,
    message: "Unknown host error",
    details: error,
  };
}
