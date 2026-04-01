export type MCPAppMode = "standalone" | "mcp-app";

export interface MCPAppEventHandlers {
  ontoolinput?: (payload: unknown) => void;
  ontoolresult?: (payload: unknown) => void;
  onhostcontextchanged?: (payload: unknown) => void;
  onteardown?: () => void;
}

export function detectMCPAppMode(win: Window = window): MCPAppMode {
  const href = win.location.href;
  const inIframe = win.parent !== win;
  if (href.includes("mcp-app=1") || (inIframe && href.includes("mcp-mode=inline"))) {
    return "mcp-app";
  }

  if ((win as Window & { __MCP_APP_MODE__?: boolean }).__MCP_APP_MODE__) {
    return "mcp-app";
  }

  return "standalone";
}

export function applyHostStyles(doc: Document = document): void {
  const root = doc.documentElement;
  const style = doc.body.style;
  style.margin = "0";
  style.fontFamily = "var(--mcp-host-font-family, Inter, system-ui, sans-serif)";
  style.background = "var(--mcp-host-surface, #f8fafc)";
  style.color = "var(--mcp-host-text, #0f172a)";
  style.paddingTop = "max(env(safe-area-inset-top), var(--mcp-safe-top, 0px))";
  style.paddingRight = "max(env(safe-area-inset-right), var(--mcp-safe-right, 0px))";
  style.paddingBottom = "max(env(safe-area-inset-bottom), var(--mcp-safe-bottom, 0px))";
  style.paddingLeft = "max(env(safe-area-inset-left), var(--mcp-safe-left, 0px))";
  root.style.colorScheme = "var(--mcp-host-color-scheme, light)";
}

export function wireLifecycleHandlers(app: {
  ontoolinput?: (handler: (payload: unknown) => void) => void;
  ontoolresult?: (handler: (payload: unknown) => void) => void;
  onhostcontextchanged?: (handler: (payload: unknown) => void) => void;
  onteardown?: (handler: () => void) => void;
}, handlers: MCPAppEventHandlers): void {
  app.ontoolinput?.((payload) => handlers.ontoolinput?.(payload));
  app.ontoolresult?.((payload) => handlers.ontoolresult?.(payload));
  app.onhostcontextchanged?.((payload) => handlers.onhostcontextchanged?.(payload));
  app.onteardown?.(() => handlers.onteardown?.());
}
