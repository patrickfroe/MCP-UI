export function getPreferredResultData(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const candidate = result as { structuredContent?: unknown; content?: unknown };
  if (candidate.structuredContent !== undefined) {
    return candidate.structuredContent;
  }

  return candidate.content !== undefined ? candidate.content : result;
}
