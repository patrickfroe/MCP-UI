import { App, PostMessageTransport } from "@mcp-ui/client";
import { applyHostStyles, detectMCPAppMode, wireLifecycleHandlers } from "@/lib/mcp-app/runtime";
import { getPreferredResultData } from "@/lib/mcp-app/result-data";
import "./mcp-app.css";

function renderState(title: string, payload: unknown) {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = `<div class=\"mcp-app-root\"><section class=\"mcp-card\"><h2>${title}</h2><pre class=\"mcp-pre\">${JSON.stringify(payload, null, 2)}</pre></section></div>`;
}

async function bootstrap() {
  applyHostStyles();

  if (detectMCPAppMode() !== "mcp-app") {
    renderState("Standalone MCP App Preview", { mode: "standalone" });
    return;
  }

  const transport = new PostMessageTransport();
  const app = new App({ transport });

  wireLifecycleHandlers(app, {
    ontoolinput: (payload) => renderState("Tool Input", payload),
    ontoolresult: (payload) => renderState("Tool Result", getPreferredResultData(payload)),
    onhostcontextchanged: (payload) => renderState("Host Context", payload),
    onteardown: () => renderState("Teardown", { status: "closed" }),
  });

  await app.connect();
}

void bootstrap();
