# AGENTS.md

This project is an MCP Apps host, not an MCP server.

Always optimize for the smallest working MCP UI Host MVP.

Primary architecture:
- Use Next.js + TypeScript for the host app.
- Integrate `@mcp-ui/client` on the frontend.
- Use `AppRenderer` to render UI-capable MCP tools.
- Keep MCP transport and resource access behind internal host APIs.
- Keep widget rendering client-side.
- Serve a sandbox proxy HTML file from the app.

MVP scope:
- One MCP server only
- Prefer streamable HTTP
- Tool-centric UX
- Searchable tool list
- Tool details
- Dynamic input form from common JSON schema shapes
- Run tool manually
- Show fallback result view for non-UI tools
- Show embedded widget for UI-capable tools
- Local run history
- Re-run last successful invocation

Source of truth for tool UI:
- Treat `_meta.ui.resourceUri` as the primary signal that a tool has embeddable UI.
- Read the UI resource through host APIs and render it through `AppRenderer`.

Required host capabilities:
- connect to MCP server
- get connection status
- list tools
- call tool
- read resource

Implementation rules:
- Keep all server connection logic outside React presentation components.
- Prefer explicit adapters and typed interfaces over framework-coupled logic.
- Make the widget path and fallback path both first-class.
- Surface errors visibly in the UI.
- Do not swallow errors.
- Keep the app runnable after every change.
- Keep code small, typed, and easy to debug.

Out of scope for this MVP:
- OAuth
- STDIO support
- multiple servers
- prompts explorer
- general resources explorer as a user-facing feature
- chat UI
- autonomous agent loops
- accounts / multi-user support
- plugin marketplace

When working:
- Read relevant files before changing code.
- State assumptions briefly, then implement.
- Do not ask for clarification unless truly blocked.
- Do not expand scope beyond the current acceptance criteria.
- After each milestone, run lint, typecheck, and relevant tests.
- Summarize changed files and remaining risks.
