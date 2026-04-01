# MCP UI Host MVP

A handoff-ready **MCP Apps host** built with Next.js + TypeScript for running MCP tools over one active server connection at a time.

## What this app is

This repository implements an MCP **host application** (not an MCP server). The app connects to one MCP server, lists tools, runs tools manually, and renders outputs in two parallel views:

- **Fallback result renderer** (always available)
- **Embedded widget renderer** for UI-capable tools using `@mcp-ui/client` `AppRenderer`

## Why this exists

MCP tool UIs need a host runtime that can:

- manage server connection lifecycle
- provide host APIs (`connect/status/listTools/callTool/readResource/disconnect`)
- keep transport/process details out of presentation components
- render embeddable UI safely in the browser

This project is the smallest practical MVP that demonstrates those capabilities for handoff.

## MVP scope

Included:

- one active MCP server connection
- transport selection:
  - streamable HTTP
  - local STDIO
- tool-centric UX
- searchable tool list
- tool details
- schema-driven input form for common JSON schema shapes
- manual tool execution
- local run history (in-memory)
- re-run last successful invocation
- fallback renderer for all tool results
- embedded widget renderer for UI-capable tools

Out of scope:

- OAuth
- multi-server support
- prompts explorer
- user-facing general resources explorer
- chat UI / autonomous agent loops
- accounts / multi-user support
- plugin marketplace

## Architecture overview

### MCP Apps host role

The app does **not** expose MCP tools itself. It acts as a host shell that talks to an external MCP server and provides host APIs for the frontend.

### Why `@mcp-ui/client` is client-side

`AppRenderer` must run in the browser to render widget UI and handle sandboxed iframe messaging. MCP transport and resource access stay behind internal host API routes.

### UI capability signal: `_meta.ui.resourceUri`

Tool UI support is derived from normalized tool metadata:

- if `_meta.ui.resourceUri` exists, the tool is treated as UI-capable
- the URI is normalized to `tool.uiBinding.resourceUri`
- the widget resource is read through `/api/host/read-resource`
- `ToolWidgetRenderer` passes `resourceText` and run context to `AppRenderer`

### Widget and fallback rendering

- **Fallback path:** always visible and usable.
- **Widget path:** attempted only for successful runs of UI-capable tools.
- If widget loading/rendering fails, error messaging is shown and fallback stays usable.

### Supported transports

- **Streamable HTTP:** JSON-RPC over HTTP POST to the configured MCP endpoint.
- **Local STDIO:** launches a local MCP subprocess and communicates with framed JSON-RPC over stdio.

#### How local STDIO works in this app (high-level)

1. Host validates command/args/cwd/env/timeouts.
2. Host spawns the subprocess.
3. Host sends `initialize` with startup timeout.
4. Host exchanges framed JSON-RPC messages with per-request timeout.
5. Host captures bounded stderr diagnostics.
6. Host handles graceful disconnect and reconnect replacement.
7. Host marks unexpected process exit as an explicit connection error.

### Sandbox proxy

`public/sandbox-proxy.html` is served by Next.js and passed to `AppRenderer` as `sandboxProxyUrl` (`/sandbox-proxy.html`).


## MCP App mode (inline host rendering)

This repo now includes a parallel MCP App runtime path in addition to the existing standalone Next.js host app.

- MCP app entry source: `src/mcp-app/mcp-app.tsx`
- Single-file artifact build: `npm run build:mcp-app`
- Output artifact: `dist/mcp-app.html`
- Minimal MCP app server wrapper: `src/server/mcp-app-server.ts`

CSP/domain metadata is explicit in the wrapper (`resourceDomains`, `connectDomains`, `frameDomains`). For this MVP they are empty lists because no external origins are required by the generated inline app artifact.

## Requirements

- Node.js **22.x** recommended
- npm

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Connect to a streamable HTTP MCP server

1. Choose **Streamable HTTP** transport.
2. Enter MCP URL (example: `http://localhost:3001/mcp`).
3. Click **Connect**.
4. Confirm tool list loads.

## Connect to a local STDIO MCP server

1. Choose **Local STDIO** transport.
2. Provide command (required), optional args/cwd/env.
3. Click **Connect**.
4. Confirm status becomes connected and tools load.

Example command for this repo test server:

```bash
node --import tsx src/test-utils/mcp-stdio-server.ts
```

## Troubleshooting

### HTTP: connect fails

- verify URL is valid (`http://` or `https://`)
- verify MCP endpoint is reachable from host app runtime
- verify auth/header settings if needed
- increase request timeout if server is slow

### HTTP: connected but no tools

- verify server supports `tools/list`
- inspect host error banner for upstream protocol errors

### STDIO: command fails to start

- verify command exists in PATH or provide absolute path
- verify args and cwd are valid
- inspect diagnostics panel stderr tail

### STDIO: startup or request timeout

- increase startup/request timeout values in config
- verify server responds to `initialize` and tool methods

### STDIO: unexpected disconnect

- app surfaces connection error explicitly
- reconnect to start a fresh subprocess session
- inspect stderr diagnostics for process-side failures

### Widget does not render

- verify tool exposes `_meta.ui.resourceUri`
- verify `/api/host/read-resource` returns `text` or `blob`
- verify `/sandbox-proxy.html` is accessible
- fallback renderer remains available

## Known limitations

- single active connection only
- run history is local in-memory (clears on reload)
- form generator supports common JSON schema shapes only
- HTTP transport currently supports request/headers/token only (no advanced auth workflows)
- STDIO transport is local-process only (no remote execution manager)

## Developer docs

See `docs/developer.md`.
