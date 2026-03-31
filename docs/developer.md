# Developer Notes

This doc describes the implementation as shipped for the MCP UI Host MVP.

## Folder/module structure

- `src/app/`
  - Next.js App Router pages and host API routes.
- `src/app/api/host/*`
  - Internal host endpoints: `connect`, `status`, `list-tools`, `call-tool`, `read-resource`, `disconnect`.
- `src/components/`
  - `host-shell.tsx`: product flow, presentation state, transport form, tool UX.
  - `tool-widget-renderer.tsx`: widget resource loading and `AppRenderer` integration.
  - `ui/*`: minimal shared UI primitives.
- `src/lib/mcp-host/`
  - `adapter.ts`: runtime + transport adapters.
  - `json-rpc.ts`: streamable HTTP JSON-RPC transport.
  - `normalizers.ts`: tool/run/resource normalization.
  - `errors.ts`: typed host error mapping.
- `src/lib/`
  - `types.ts`: normalized host contracts.
  - `host-client.ts`: frontend API client.
  - `host-shell-model.ts`: pure UI model helpers.
  - `tool-execution.ts`: schema/form coercion/validation/widget gating.
- `src/test-utils/`
  - fixtures and stdio test server.

## Shared host adapter architecture

`MCPHostRuntime` is the single host runtime used by API routes. It enforces one active adapter/session at a time:

- disconnect previous adapter before every connect
- create transport adapter by config type
- delegate status/list/call/read/disconnect through normalized interface

Adapters:

- `HttpHostAdapter`
- `StdioHostAdapter`

Both implement `MCPHostAdapter` from `src/lib/types.ts`.

## Transport abstraction design

`createTransportAdapter(config)` selects adapter by `config.type`.

Presentation components never call transport objects directly. They call API routes via `hostClient` and use normalized types.

## HTTP adapter responsibilities

`HttpHostAdapter` handles:

- config validation for HTTP URL and runtime metadata
- initialize handshake
- tools list / tool call / resource read via JSON-RPC requests
- connection status transitions (`disconnected`/`connecting`/`connected`/`error`)
- timeout/header/auth-token wiring through `MCPStreamableHttpTransport`

## STDIO adapter + process manager responsibilities

`StdioSession` + `StdioHostAdapter` handle:

- subprocess spawn for local server command
- JSON-RPC framing (`Content-Length` protocol)
- startup timeout (`initialize`) and request timeout for each call
- bounded stderr capture (tail limit)
- malformed JSON response detection
- unexpected process exit mapping (`PROCESS_EXITED`)
- graceful disconnect (`SIGTERM` then fallback `SIGKILL`)
- reconnect replacement (previous session is terminated first)

## Normalized data model overview

Key shapes (in `src/lib/types.ts`):

- `MCPServerConnection`: status, transport, server info, process diagnostics.
- `MCPToolDescriptor`: normalized tool info + optional `uiBinding.resourceUri`.
- `MCPToolRun`: normalized run record for fallback and history views.
- `MCPResourceContents`: normalized `resources/read` payload.

Normalization entry points: `src/lib/mcp-host/normalizers.ts`.

## Where tool execution is wired

- UI trigger: `HostShell` run actions.
- Call path: `hostClient.callTool` -> `/api/host/call-tool` -> `mcpHostAdapter.callTool`.
- Form shaping/validation: `src/lib/tool-execution.ts`.

## Where widget rendering is wired

- Gate: `isUiCapableTool` + `shouldRenderWidget` in `tool-execution.ts`.
- Component: `src/components/tool-widget-renderer.tsx`.
- Resource read path: `hostClient.readResource` -> `/api/host/read-resource`.
- Render target: `@mcp-ui/client` `AppRenderer` with sandbox proxy URL.

## Where fallback rendering is wired

- `ResultFallbackView` in `src/components/host-shell.tsx`.
- Serialization helper: `serializeFallbackResult` in `src/lib/host-shell-model.ts`.

Fallback remains available even when widget rendering fails.

## Debugging transport issues

1. Check `/api/host/status` first.
2. Reconnect via `/api/host/connect` and inspect returned `connection` state.
3. Verify `/api/host/list-tools` behavior.
4. For STDIO, inspect `connection.process.stderrTail` diagnostics.
5. For HTTP, verify endpoint and timeout/header/auth settings.

## Debugging widget issues

1. Confirm tool has `_meta.ui.resourceUri` (normalized to `uiBinding.resourceUri`).
2. Run tool successfully (widget path is success-gated).
3. Verify `/api/host/read-resource` returns `text` or `blob`.
4. Open `/sandbox-proxy.html` directly and verify availability.
5. Inspect browser console + widget status/error banner.

## Testing strategy overview

Coverage is split across:

- pure helpers and UI model behavior
  - `src/lib/tool-execution.test.ts`
  - `src/lib/host-shell-model.test.ts`
  - `src/lib/mcp-host/normalizers.test.ts`
- transport lifecycle + adapter/runtime behavior
  - `src/lib/mcp-host/adapter.test.ts`
- API route behavior
  - `src/app/api/host/routes.test.ts`

The tests include both transports, transport switching, fallback/widget gates, and stdio lifecycle scenarios (timeouts, exits, reconnect, stderr bounds).

## Handoff checklist

Before handoff run:

```bash
npm run lint
npm run typecheck
npm run test
```
