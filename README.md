# MCP UI Host MVP

A minimal, handoff-ready **MCP Apps host** built with Next.js + TypeScript.

## What this app is

This project is a local host application that connects to one MCP server over streamable HTTP, lists tools, runs tools manually, and renders results in two parallel paths:

- **Fallback result renderer** (always available)
- **Embedded widget renderer** for UI-capable tools via `@mcp-ui/client` `AppRenderer`

## Why this exists

MCP tool UIs need a host runtime. This app provides the smallest practical host that keeps MCP transport and resource access behind internal APIs while rendering widget UI safely in the browser.

## MCP Apps host role (not an MCP server)

This codebase does **not** implement MCP server capabilities. It acts as a host shell that:

- connects to a compatible MCP server
- checks connection status
- lists tools
- calls tools
- reads resources
- passes UI resources into `AppRenderer`

## MVP scope

Included:

- single MCP server connection
- streamable HTTP transport
- searchable tool list
- tool details panel
- schema-driven input form (common JSON schema shapes)
- manual tool execution
- fallback result rendering
- widget rendering for UI-capable tools
- local in-memory run history
- re-run last successful invocation

Out of scope:

- OAuth
- STDIO support
- multiple MCP servers
- prompts explorer
- user-facing general resources explorer
- chat UI / autonomous agent loops
- accounts / multi-user support
- plugin marketplace

## Architecture overview

### Frontend

- `src/components/host-shell.tsx`: main host UI orchestration
- `src/components/tool-widget-renderer.tsx`: reads UI resources and mounts `AppRenderer`
- `src/lib/tool-execution.ts`: schema/form helpers, coercion, validation, widget eligibility rules
- `src/lib/host-shell-model.ts`: pure UI model helpers (filtering, selection reset, run-history shaping)

### Host APIs (Next.js route handlers)

- `POST /api/host/connect`
- `GET /api/host/status`
- `GET /api/host/list-tools`
- `POST /api/host/call-tool`
- `POST /api/host/read-resource`

These routes delegate to `MCPHostAdapter` (`src/lib/mcp-host/adapter.ts`) which encapsulates MCP transport usage.

## Why `@mcp-ui/client` is client-side

`AppRenderer` must run in the browser because it renders embedded widget UI and manages sandboxed iframe communication. The host keeps MCP server access on internal APIs while the browser handles rendering concerns.

## UI capability signal: `_meta.ui.resourceUri`

Tool UI support is determined from normalized tool metadata. A tool is treated as UI-capable when `_meta.ui.resourceUri` is present and normalized into `tool.uiBinding.resourceUri`. The host then reads that resource and renders it in `AppRenderer`.

## Sandbox proxy

The app serves `public/sandbox-proxy.html`, which is passed to `AppRenderer` as `sandboxProxyUrl`. This proxy is required for embedded MCP UI sandbox messaging.

## Requirements

- Node.js **22.x** recommended
- npm (default scripts assume npm)

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Connect a compatible MCP server

1. Start your MCP server (streamable HTTP endpoint).
2. In the host UI, set the MCP URL (default: `http://localhost:3001/mcp`).
3. Click **Connect**.
4. Confirm tools appear in the left panel.

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Renderer behavior

### Fallback renderer

Always shows the most recent result for the selected tool as formatted or raw JSON/text. It remains available even if widget loading or rendering fails.

### Widget renderer

For successful runs of UI-capable tools, the host:

1. reads `resourceUri` through `/api/host/read-resource`
2. passes resource text + tool input/result to `AppRenderer`
3. surfaces widget/resource failures while keeping fallback output visible

## Known limitations

- single-server host state in-memory only
- run history is local in-memory (resets on reload)
- schema form generator supports common JSON schema field patterns only
- widget quality depends on MCP server resource correctness
- no authentication/OAuth flows in MVP

## Troubleshooting

### "Not connected" / tool list empty

- verify MCP server is running
- verify URL is correct and reachable from browser + host app
- reconnect from the host UI

### Connect fails immediately

- ensure server exposes streamable HTTP MCP endpoint
- inspect server logs for initialize request failures
- check host error banner for returned MCP error code/message

### Widget does not render

- confirm tool has `_meta.ui.resourceUri`
- check `/api/host/read-resource` can return `text` or `blob`
- verify `public/sandbox-proxy.html` is served (open `/sandbox-proxy.html` directly)
- fallback result view should still show tool output

### Validation errors before run

- required fields must be non-empty
- number/integer fields must parse as numbers
- object/array fields must contain valid JSON of the expected shape


## Developer documentation

See `docs/developer.md` for implementation-oriented guidance.
