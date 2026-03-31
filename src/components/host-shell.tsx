"use client";

import { useEffect, useMemo, useState } from "react";
import { hostClient } from "@/lib/host-client";
import type { MCPConnectionStatus, MCPServerConfig, MCPToolDescriptor, MCPToolRun, MCPTransportType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToolWidgetRenderer, type WidgetRenderStatus } from "@/components/tool-widget-renderer";
import {
  coerceArgsForSubmission,
  getInputFields,
  getLatestRunForTool,
  isUiCapableTool,
  shouldRenderWidget,
  validateToolArgs,
} from "@/lib/tool-execution";
import {
  buildConnectionConfig,
  createRunHistoryItem,
  filterTools,
  getNextSelectionState,
  serializeFallbackResult,
  type RunHistoryItem,
  validateConnectionConfig,
} from "@/lib/host-shell-model";

const DEFAULT_SERVER_URL = "http://localhost:3001/mcp";

function ResultFallbackView({ result }: { result: unknown }) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const serialized = useMemo(() => serializeFallbackResult(result), [result]);
  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(serialized.pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return <div className="space-y-2"><div className="flex items-center gap-2"><Button type="button" className="bg-slate-50" onClick={() => setShowRawJson((current) => !current)}>{showRawJson ? "View formatted" : "View raw JSON"}</Button><Button type="button" className="bg-slate-50" onClick={() => void copyResult()}>{copied ? "Copied" : "Copy"}</Button></div><pre className="max-h-80 overflow-auto rounded-md bg-slate-100 p-2 text-xs text-slate-800">{showRawJson ? serialized.raw : serialized.pretty}</pre></div>;
}

function ToolCapabilityBadge({ isUi }: { isUi: boolean }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${isUi ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>{isUi ? "UI-capable" : "No embedded UI"}</span>;
}

export function HostShell() {
  const [connectionStatus, setConnectionStatus] = useState<MCPConnectionStatus>("disconnected");
  const [transport, setTransport] = useState<MCPTransportType>("streamable-http");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [stdioCommand, setStdioCommand] = useState("");
  const [stdioArgs, setStdioArgs] = useState("");
  const [stdioCwd, setStdioCwd] = useState("");
  const [stdioEnvText, setStdioEnvText] = useState("");
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPToolDescriptor[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [runs, setRuns] = useState<MCPToolRun[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [widgetStatus, setWidgetStatus] = useState<WidgetRenderStatus>("idle");
  const [isRunning, setIsRunning] = useState(false);

  const isConnecting = connectionStatus === "connecting";
  const isConnected = connectionStatus === "connected";
  const canConnect = (transport === "streamable-http" ? serverUrl.trim().length > 0 : stdioCommand.trim().length > 0) && !isConnecting;

  const selectedTool = useMemo(() => tools.find((tool) => tool.name === selectedToolName) ?? null, [selectedToolName, tools]);
  const selectedToolRun = useMemo(() => getLatestRunForTool(runs, selectedToolName), [runs, selectedToolName]);
  const filteredTools = useMemo(() => filterTools(tools, search), [search, tools]);
  const toolFields = useMemo(() => getInputFields(selectedTool), [selectedTool]);

  const loadConnectionStatus = async () => {
    try {
      const { connection } = await hostClient.status();
      setConnectionStatus(connection.status);
      setTransport(connection.transport);
      if (connection.transport === "streamable-http") {
        setServerUrl(connection.baseUrl || DEFAULT_SERVER_URL);
      }
      if (connection.transport === "stdio") {
        setStdioCommand(connection.process?.command ?? "");
        setStdioArgs((connection.process?.args ?? []).join(" "));
        setDebugInfo(connection.process?.stderrTail?.join("\n") ?? null);
      }
      if (connection.status === "connected") {
        const toolData = await hostClient.listTools();
        setTools(toolData.tools);
        const next = getNextSelectionState(toolData.tools, toolData.tools[0]?.name ?? null);
        setSelectedToolName(next.selectedToolName);
        setArgs(next.args);
      }
    } catch {
      setConnectionStatus("disconnected");
    }
  };

  useEffect(() => {
    void loadConnectionStatus();
  }, []);

  const buildConfig = (): MCPServerConfig =>
    buildConnectionConfig(transport, serverUrl, {
      command: stdioCommand,
      argsText: stdioArgs,
      cwd: stdioCwd,
      envText: stdioEnvText,
    });

  const connectAndLoadTools = async () => {
    const config = buildConfig();
    const validationError = validateConnectionConfig(config);
    if (validationError) {
      setError(validationError);
      return;
    }

    setConnectionStatus("connecting");
    setError(null);

    try {
      const { connection } = await hostClient.connect(config);
      const toolData = await hostClient.listTools();
      setTools(toolData.tools);
      const next = getNextSelectionState(toolData.tools, toolData.tools[0]?.name ?? null);
      setSelectedToolName(next.selectedToolName);
      setArgs(next.args);
      setConnectionStatus("connected");
      setDebugInfo(connection.process?.stderrTail?.join("\n") ?? null);
    } catch (err) {
      setTools([]);
      setSelectedToolName(null);
      setArgs({});
      setConnectionStatus("error");
      const message = err instanceof Error ? err.message : "Failed to connect to MCP server";
      setError(message);
      setDebugInfo(message.includes("PROCESS") || message.includes("TIMEOUT") ? "Check command, args, cwd, and timeout values." : null);
    }
  };

  const disconnect = async () => {
    await hostClient.disconnect();
    setConnectionStatus("disconnected");
    setTools([]);
    setSelectedToolName(null);
    setArgs({});
  };

  const executeTool = async (tool: MCPToolDescriptor, nextArgs: Record<string, unknown>) => {
    setIsRunning(true);
    setError(null);
    setWidgetError(null);
    setWidgetStatus("idle");
    try {
      const data = await hostClient.callTool(tool.name, nextArgs);
      setRuns((previous) => [data.run, ...previous]);
      setRunHistory((previous) => [createRunHistoryItem({ id: data.run.id, toolName: data.run.toolName, timestamp: data.run.createdAt, status: data.run.succeeded ? "success" : "error", args: nextArgs }), ...previous]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool call failed";
      setError(message);
      setRunHistory((previous) => [createRunHistoryItem({ id: `error-${Date.now()}`, toolName: tool.name, status: "error", args: nextArgs }), ...previous]);
    } finally {
      setIsRunning(false);
    }
  };

  const runTool = async () => {
    if (!selectedTool) return;
    const validationErrors = validateToolArgs(selectedTool, args);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }
    await executeTool(selectedTool, coerceArgsForSubmission(selectedTool, args));
  };

  const rerunLastSuccessful = async () => {
    const lastSuccessful = runHistory.find((run) => run.status === "success");
    if (!lastSuccessful) return;
    const nextTool = tools.find((tool) => tool.name === lastSuccessful.toolName);
    if (!nextTool) {
      setError(`Unable to re-run ${lastSuccessful.toolName}; tool is unavailable.`);
      return;
    }
    setSelectedToolName(nextTool.name);
    setArgs(lastSuccessful.args);
    await executeTool(nextTool, lastSuccessful.args);
  };

  const renderForm = () => {
    if (!selectedTool) return <p className="text-sm text-slate-500">Select a tool to configure inputs.</p>;
    if (!toolFields.length) return <p className="text-sm text-slate-500">No input schema detected. This tool can run without additional input.</p>;
    return <div className="space-y-3">{toolFields.map((field) => {
      const inputId = `input-${field.name}`;
      return <div key={field.name} className="space-y-1"><label className="text-sm font-medium text-slate-700" htmlFor={inputId}>{field.schema.title ?? field.name}{field.required ? <span className="ml-1 text-red-600">*</span> : null}</label>{field.schema.description ? <p className="text-xs text-slate-500">{field.schema.description}</p> : null}{field.schema.enum ? <select id={inputId} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={String(args[field.name] ?? "")} onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}>{field.schema.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select> : field.schema.type === "boolean" ? <label className="flex items-center gap-2 rounded-md border border-slate-300 p-2 text-sm"><input id={inputId} type="checkbox" checked={Boolean(args[field.name])} onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.checked }))} /><span>Enabled</span></label> : field.schema.type === "number" || field.schema.type === "integer" ? <Input id={inputId} type="number" value={String(args[field.name] ?? "")} onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))} /> : field.schema.type === "array" || field.schema.type === "object" ? <Textarea id={inputId} value={String(args[field.name] ?? (field.schema.type === "array" ? "[]" : "{}"))} onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))} rows={4} /> : <Input id={inputId} value={String(args[field.name] ?? "")} onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))} />}</div>;
    })}</div>;
  };

  const latestResult = selectedToolRun?.result ?? { message: "Run a tool to view result output." };

  return (
    <main className="h-screen p-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">MCP UI Host MVP</h1>
        <span className="text-xs text-slate-600">Single server · HTTP or STDIO</span>
      </div>

      <Card className="mb-3 p-3">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-3">
            <label htmlFor="transport-type" className="text-xs font-medium text-slate-700">Transport</label>
            <select id="transport-type" className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={transport} onChange={(event) => setTransport(event.target.value as MCPTransportType)}>
              <option value="streamable-http">Streamable HTTP</option>
              <option value="stdio">Local STDIO</option>
            </select>
          </div>
          {transport === "streamable-http" ? <div className="col-span-7"><label htmlFor="server-url" className="text-xs font-medium text-slate-700">MCP server URL</label><Input id="server-url" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://localhost:3001/mcp" /></div> : <><div className="col-span-4"><label htmlFor="stdio-command" className="text-xs font-medium text-slate-700">Command</label><Input id="stdio-command" value={stdioCommand} onChange={(event) => setStdioCommand(event.target.value)} placeholder="node" /></div><div className="col-span-3"><label htmlFor="stdio-args" className="text-xs font-medium text-slate-700">Args</label><Input id="stdio-args" value={stdioArgs} onChange={(event) => setStdioArgs(event.target.value)} placeholder="server.js --stdio" /></div><div className="col-span-2"><label htmlFor="stdio-cwd" className="text-xs font-medium text-slate-700">cwd</label><Input id="stdio-cwd" value={stdioCwd} onChange={(event) => setStdioCwd(event.target.value)} placeholder="/workspace" /></div><div className="col-span-3"><label htmlFor="stdio-env" className="text-xs font-medium text-slate-700">env (KEY=VALUE per line)</label><Textarea id="stdio-env" rows={1} value={stdioEnvText} onChange={(event) => setStdioEnvText(event.target.value)} placeholder="FOO=bar" /></div></>}
          <div className="col-span-2 flex items-end gap-2">
            <Button onClick={() => void connectAndLoadTools()} disabled={!canConnect}>{isConnecting ? "Connecting…" : "Connect"}</Button>
            <Button className="bg-slate-50" onClick={() => void disconnect()} disabled={!isConnected}>Disconnect</Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {connectionStatus === "connected" && "Connected. Tools are ready to run."}
          {connectionStatus === "connecting" && `Connecting via ${transport === "stdio" ? "local STDIO" : "streamable HTTP"}…`}
          {connectionStatus === "error" && `Connection failed (${transport === "stdio" ? "Local STDIO" : "Streamable HTTP"}). Check settings and diagnostics.`}
          {connectionStatus === "disconnected" && "Not connected yet. Connect to load tools."}
        </p>
        {debugInfo ? <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-slate-100 p-2 text-xs text-slate-700">{debugInfo}</pre> : null}
      </Card>

      {error ? <div className="mb-2 rounded-md bg-red-100 p-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid h-[calc(100vh-11rem)] grid-cols-12 gap-3">
        <Card className="col-span-3 p-3"><div className="flex items-center gap-2"><Input placeholder="Search tools" value={search} onChange={(event) => setSearch(event.target.value)} disabled={!isConnected} /><Button type="button" className="bg-slate-50" onClick={() => void connectAndLoadTools()} disabled={!isConnected || isConnecting}>Refresh</Button></div><div className="mt-3 space-y-2 overflow-auto">{!isConnected ? <p className="text-xs text-slate-500">Connect to an MCP server to list tools.</p> : null}{isConnected && tools.length === 0 ? <p className="text-xs text-slate-500">Connected, but no tools were returned by the server.</p> : null}{isConnected && tools.length > 0 && filteredTools.length === 0 ? <p className="text-xs text-slate-500">No tools match the current search.</p> : null}{filteredTools.map((tool) => {const toolHasUi = isUiCapableTool(tool); return <button key={tool.name} className={`w-full rounded-md border p-2 text-left text-sm ${selectedToolName === tool.name ? "border-slate-500 bg-slate-100" : "border-slate-200"}`} onClick={() => {const next = getNextSelectionState(tools, tool.name); setSelectedToolName(next.selectedToolName); setArgs(next.args); setWidgetError(null); setWidgetStatus("idle");}}><div className="flex items-center justify-between gap-2"><div className="font-medium">{tool.title ?? tool.name}</div><ToolCapabilityBadge isUi={toolHasUi} /></div><div className="text-xs text-slate-500">{tool.description ?? tool.name}</div></button>;})}</div></Card>

        <Card className="col-span-5 space-y-4 p-4"><div><h2 className="font-semibold">{selectedTool?.title ?? "Select a tool"}</h2><p className="text-sm text-slate-600">{selectedTool?.description ?? "No tool selected."}</p>{selectedTool ? <span className="mt-2 inline-flex"><ToolCapabilityBadge isUi={isUiCapableTool(selectedTool)} /></span> : null}</div>{renderForm()}<div className="flex gap-2"><Button onClick={() => void runTool()} disabled={!selectedTool || isRunning || !isConnected}>{isRunning ? "Running…" : "Run tool"}</Button><Button onClick={() => void rerunLastSuccessful()} disabled={isRunning || !runHistory.some((run) => run.status === "success") || !isConnected}>Re-run last successful</Button></div>{isRunning ? <p className="text-xs text-slate-600">Tool run in progress. Waiting for MCP response…</p> : null}{selectedToolRun?.succeeded ? <p className="text-xs text-emerald-700">Last run succeeded for this tool.</p> : null}{selectedToolRun && !selectedToolRun.succeeded ? <p className="text-xs text-red-700">Last run failed for this tool. Check fallback output and error details.</p> : null}</Card>

        <Card className="col-span-4 grid grid-rows-2 gap-3 p-3">
          <div className="min-h-0 space-y-3 overflow-auto">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Fallback result</h3>
              <ResultFallbackView result={latestResult} />
            </div>
            {selectedTool && selectedToolRun && selectedTool.uiBinding && shouldRenderWidget(selectedTool, selectedToolRun) ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Embedded widget</h3>
                {widgetStatus === "loading" ? <p className="mb-2 text-xs text-slate-600">Loading widget resource…</p> : null}
                {widgetStatus === "success" ? <p className="mb-2 text-xs text-emerald-700">Widget rendered successfully.</p> : null}
                {widgetError ? <div className="mb-2 rounded-md bg-amber-100 p-2 text-xs text-amber-800">Widget failed: {widgetError}. Fallback results remain available.</div> : null}
                <ToolWidgetRenderer
                  key={`${selectedTool.name}:${selectedToolRun.id}`}
                  toolName={selectedTool.name}
                  toolInput={selectedToolRun.args}
                  toolResult={selectedToolRun.result}
                  resourceUri={selectedTool.uiBinding.resourceUri}
                  onError={setWidgetError}
                  onStatusChange={setWidgetStatus}
                />
              </div>
            ) : selectedTool && isUiCapableTool(selectedTool) ? (
              <p className="text-xs text-slate-500">Run this UI-capable tool successfully to render its embedded widget.</p>
            ) : (
              <p className="text-xs text-slate-500">Selected tool does not expose embedded UI. Use fallback results.</p>
            )}
          </div>
          <div className="min-h-0 overflow-auto">
            <h3 className="mb-2 text-sm font-semibold">Run history</h3>
            <div className="space-y-2">
              {runHistory.map((run) => <div key={run.id} className="rounded-md border border-slate-200 p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-medium">{run.toolName}</span><span className={run.status === "success" ? "text-emerald-700" : "text-red-700"}>{run.status}</span></div><div className="text-slate-600">{new Date(run.timestamp).toLocaleString()}</div><div className="truncate text-slate-500">{run.inputSummary}</div></div>)}
              {runHistory.length === 0 ? <p className="text-xs text-slate-500">No runs yet. Run a tool to populate local history.</p> : null}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
