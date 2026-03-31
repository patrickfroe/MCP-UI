# Developer Notes

This document is intentionally brief and focused on this MVP codebase.

## Folder/module map

- `src/app/`
  - Next.js app router entrypoints and host API routes.
- `src/components/`
  - `host-shell.tsx`: main UI state + flow orchestration.
  - `tool-widget-renderer.tsx`: widget resource loading + `AppRenderer` mounting.
  - `ui/`: small shared presentational primitives.
- `src/lib/`
  - `mcp-host/`: transport adapter, normalizers, and MCP error mapping.
  - `tool-execution.ts`: schema-to-form helpers, coercion, validation, widget gating helpers.
  - `host-shell-model.ts`: pure model helpers for filtering/selection/history/fallback serialization.
  - `types.ts`: normalized host-side types.
- `src/test-utils/`
  - stable fixtures for tests.

## Host adapter responsibilities

`MCPHostAdapter` (`src/lib/mcp-host/adapter.ts`) owns MCP server interaction and keeps connection logic outside React components.

Responsibilities:

- connect and initialize over streamable HTTP
- store single-server connection status
- list tools and normalize descriptors
- call tools and normalize runs
- read resources and normalize resource payloads

The UI should talk to adapter-backed API routes only.

## Normalized data model (high-level)

- `MCPServerConnection`: host connection metadata + status/error.
- `MCPToolDescriptor`: normalized tool metadata + optional `uiBinding.resourceUri`.
- `MCPToolRun`: normalized run record for history and result panels.
- `MCPResourceContents`: normalized resource read response for widget loading.

Normalization logic lives in `src/lib/mcp-host/normalizers.ts`.

## Where rendering paths are wired

- **Fallback path:** `ResultFallbackView` in `src/components/host-shell.tsx`.
- **Widget path:** `ToolWidgetRenderer` in `src/components/tool-widget-renderer.tsx`.
- Widget eligibility gate: `shouldRenderWidget` + `isUiCapableTool` in `src/lib/tool-execution.ts`.

Both paths are first-class and should remain visible.

## Adding a new schema field type safely

1. Add support in `ToolFieldSchema`/related types (`src/lib/tool-execution.ts`).
2. Extend `buildInitialArgs`, `validateToolArgs`, and `coerceArgsForSubmission` consistently.
3. Add rendering logic in `host-shell.tsx` form section.
4. Add/adjust tests in `src/lib/tool-execution.test.ts`.
5. Confirm fallback + widget paths still behave unchanged.

## Debugging widget issues

1. Verify selected tool is UI-capable (`uiBinding.resourceUri` exists).
2. Confirm tool run succeeded (widget path is success-only in MVP).
3. Check `/api/host/read-resource` behavior and returned payload (`text` or `blob`).
4. Confirm `/sandbox-proxy.html` is accessible.
5. Inspect browser console for `AppRenderer` errors; fallback output should remain available.

## Debugging MCP integration issues

1. Start with `GET /api/host/status`.
2. Reconnect via `POST /api/host/connect` and confirm no initialize error.
3. Call `GET /api/host/list-tools` to validate upstream tool list.
4. Validate `POST /api/host/call-tool` payload shape and adapter error mapping.
5. If needed, inspect `src/lib/mcp-host/json-rpc.ts` for transport-level failures.

## Testing strategy

- Unit tests for pure model/logic helpers:
  - `src/lib/tool-execution.test.ts`
  - `src/lib/host-shell-model.test.ts`
  - `src/lib/mcp-host/normalizers.test.ts`
- Adapter and API route behavior tests:
  - `src/lib/mcp-host/adapter.test.ts`
  - `src/app/api/host/routes.test.ts`

Run full checks before handoff:

```bash
npm run lint
npm run typecheck
npm run test
```
