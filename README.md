# MCP UI Host MVP

A local single-user MCP Apps host built with Next.js, TypeScript, and `@mcp-ui/client`.

## What this app does

This app connects to one MCP server, lists available tools, lets the user run a tool, and renders tool-provided UI inside the host when the tool exposes a UI resource.

The app supports two result paths:

- Fallback result rendering for normal tools
- Embedded widget rendering for UI-capable tools

## Why `@mcp-ui/client` is integrated client-side

`@mcp-ui/client` is used in the browser to render MCP tool UIs through `AppRenderer`. The host app remains responsible for MCP connectivity, resource reads, and tool calls through internal APIs.

## MVP scope

### Included

- one MCP server
- streamable HTTP preferred
- searchable tools list
- selected tool details
- dynamic tool input form
- manual tool execution
- embedded widget rendering for UI-capable tools
- JSON/text fallback rendering for non-UI tools
- local run history
- rerun support

### Not included

- OAuth
- STDIO
- multiple servers
- prompts explorer
- user-facing resource browser
- chat/agent orchestration
- accounts

## Architecture overview

- Frontend:
  - Next.js / React
  - `@mcp-ui/client`
  - `AppRenderer` for widget rendering

- Host APIs:
  - `connect`
  - `status`
  - `listTools`
  - `callTool`
  - `readResource`

- UI detection:
  - A tool is considered UI-capable when `_meta.ui.resourceUri` is present

## Sandbox proxy

`AppRenderer` requires a sandbox proxy HTML page served by this app. The sandbox proxy is a core part of the architecture: it isolates guest tool UI inside sandboxed iframes and forwards JSON-RPC-style messages between the host and the guest UI.

## Local setup

Recommended environment:

- Node.js 22.x
- npm or pnpm

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

## Demo server

Use a compatible MCP server that exposes tools and, ideally, at least one tool with `_meta.ui.resourceUri`.

## Known limitations

- only one MCP server at a time
- only common JSON schema shapes are supported in the first form generator
- widget support depends on the server exposing proper MCP Apps UI resources
- fallback rendering is intentionally simple in MVP
