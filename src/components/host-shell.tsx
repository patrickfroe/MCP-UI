"use client";

import { useEffect, useMemo, useState } from "react";
import { hostClient } from "@/lib/host-client";
import type { MCPToolDescriptor, MCPToolRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToolWidgetRenderer } from "@/components/tool-widget-renderer";
import {
  buildInitialArgs,
  buildInputSummary,
  coerceArgsForSubmission,
  getInputFields,
  getLatestRunForTool,
  isUiCapableTool,
  shouldRenderWidget,
  validateToolArgs,
} from "@/lib/tool-execution";

interface RunHistoryItem {
  id: string;
  toolName: string;
  timestamp: string;
  status: "success" | "error";
  inputSummary: string;
  args: Record<string, unknown>;
}

function ResultFallbackView({ result }: { result: unknown }) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const prettyResult = useMemo(() => {
    if (result === null || result === undefined) {
      return "No result data returned.";
    }

    if (typeof result === "string") {
      return result;
    }

    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }, [result]);

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(prettyResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setShowRawJson((current) => !current)}>
          {showRawJson ? "View formatted" : "View raw JSON"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyResult()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md bg-slate-100 p-2 text-xs text-slate-800">
        {showRawJson ? JSON.stringify(result) : prettyResult}
      </pre>
    </div>
  );
}

export function HostShell() {
  const [tools, setTools] = useState<MCPToolDescriptor[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [runs, setRuns] = useState<MCPToolRun[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await hostClient.connect("http://localhost:3001/mcp");
        const toolData = await hostClient.listTools();
        setTools(toolData.tools);
        if (toolData.tools[0]) {
          setSelectedToolName(toolData.tools[0].name);
          setArgs(buildInitialArgs(toolData.tools[0]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize host");
      }
    })();
  }, []);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedToolName) ?? null,
    [selectedToolName, tools],
  );

  const selectedToolRun = useMemo(() => getLatestRunForTool(runs, selectedToolName), [runs, selectedToolName]);

  const filteredTools = useMemo(() => {
    const needle = search.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        (tool.title ?? "").toLowerCase().includes(needle) ||
        (tool.description ?? "").toLowerCase().includes(needle),
    );
  }, [search, tools]);

  const toolFields = useMemo(() => getInputFields(selectedTool), [selectedTool]);

  const executeTool = async (tool: MCPToolDescriptor, nextArgs: Record<string, unknown>) => {
    setIsRunning(true);
    setError(null);
    setWidgetError(null);

    try {
      const data = await hostClient.callTool(tool.name, nextArgs);
      setRuns((previous) => [data.run, ...previous]);
      setRunHistory((previous) => [
        {
          id: data.run.id,
          toolName: data.run.toolName,
          timestamp: data.run.createdAt,
          status: data.run.succeeded ? "success" : "error",
          inputSummary: buildInputSummary(nextArgs),
          args: nextArgs,
        },
        ...previous,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool call failed";
      setError(message);
      setRunHistory((previous) => [
        {
          id: `error-${Date.now()}`,
          toolName: tool.name,
          timestamp: new Date().toISOString(),
          status: "error",
          inputSummary: buildInputSummary(nextArgs),
          args: nextArgs,
        },
        ...previous,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const runTool = async () => {
    if (!selectedTool) {
      return;
    }

    const validationErrors = validateToolArgs(selectedTool, args);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    const preparedArgs = coerceArgsForSubmission(selectedTool, args);
    await executeTool(selectedTool, preparedArgs);
  };

  const rerunLastSuccessful = async () => {
    const lastSuccessful = runHistory.find((run) => run.status === "success");
    if (!lastSuccessful) {
      return;
    }

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
    if (!selectedTool) {
      return <p className="text-sm text-slate-500">Select a tool to configure inputs.</p>;
    }

    if (!toolFields.length) {
      return <p className="text-sm text-slate-500">This tool does not require inputs.</p>;
    }

    return (
      <div className="space-y-3">
        {toolFields.map((field) => {
          const inputId = `input-${field.name}`;

          return (
            <div key={field.name} className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor={inputId}>
                {field.schema.title ?? field.name}
                {field.required ? <span className="ml-1 text-red-600">*</span> : null}
              </label>
              {field.schema.description ? <p className="text-xs text-slate-500">{field.schema.description}</p> : null}
              {field.schema.enum ? (
                <select
                  id={inputId}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  value={String(args[field.name] ?? "")}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                >
                  {field.schema.enum.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {String(option)}
                    </option>
                  ))}
                </select>
              ) : field.schema.type === "boolean" ? (
                <label className="flex items-center gap-2 rounded-md border border-slate-300 p-2 text-sm">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={Boolean(args[field.name])}
                    onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.checked }))}
                  />
                  <span>Enabled</span>
                </label>
              ) : field.schema.type === "number" || field.schema.type === "integer" ? (
                <Input
                  id={inputId}
                  type="number"
                  value={String(args[field.name] ?? "")}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                />
              ) : field.schema.type === "array" || field.schema.type === "object" ? (
                <Textarea
                  id={inputId}
                  value={String(args[field.name] ?? (field.schema.type === "array" ? "[]" : "{}"))}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                  rows={4}
                />
              ) : (
                <Input
                  id={inputId}
                  value={String(args[field.name] ?? "")}
                  onChange={(event) => setArgs((prev) => ({ ...prev, [field.name]: event.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="h-screen p-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">MCP UI Host MVP</h1>
        <span className="text-xs text-slate-600">Single server · Streamable HTTP</span>
      </div>
      {error && <div className="mb-2 rounded-md bg-red-100 p-2 text-sm text-red-700">{error}</div>}
      <div className="grid h-[calc(100vh-4.5rem)] grid-cols-12 gap-3">
        <Card className="col-span-3 p-3">
          <Input placeholder="Search tools" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="mt-3 space-y-2 overflow-auto">
            {filteredTools.map((tool) => {
              const toolHasUi = isUiCapableTool(tool);
              return (
                <button
                  key={tool.name}
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    selectedToolName === tool.name ? "border-slate-500 bg-slate-100" : "border-slate-200"
                  }`}
                  onClick={() => {
                    setSelectedToolName(tool.name);
                    setArgs(buildInitialArgs(tool));
                    setWidgetError(null);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{tool.title ?? tool.name}</div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        toolHasUi ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {toolHasUi ? "UI-capable" : "No embedded UI"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{tool.description ?? tool.name}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="col-span-5 space-y-4 p-4">
          <div>
            <h2 className="font-semibold">{selectedTool?.title ?? "Select a tool"}</h2>
            <p className="text-sm text-slate-600">{selectedTool?.description ?? "No tool selected."}</p>
            {selectedTool ? (
              <span
                className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-semibold ${
                  isUiCapableTool(selectedTool) ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                }`}
              >
                {isUiCapableTool(selectedTool) ? "UI-capable" : "No embedded UI"}
              </span>
            ) : null}
          </div>
          {renderForm()}
          <div className="flex gap-2">
            <Button onClick={() => void runTool()} disabled={!selectedTool || isRunning}>
              {isRunning ? "Running…" : "Run tool"}
            </Button>
            <Button onClick={() => void rerunLastSuccessful()} disabled={isRunning || !runHistory.some((run) => run.status === "success") }>
              Re-run last successful
            </Button>
          </div>
        </Card>

        <Card className="col-span-4 grid grid-rows-2 gap-3 p-3">
          <div className="min-h-0 space-y-3 overflow-auto">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Fallback result</h3>
              <ResultFallbackView result={selectedToolRun?.result ?? { message: "Run a tool to see result" }} />
            </div>
            {shouldRenderWidget(selectedTool, selectedToolRun) ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Embedded widget</h3>
                {widgetError ? (
                  <div className="rounded-md bg-amber-100 p-2 text-xs text-amber-800">
                    Widget error: {widgetError}. Fallback results remain available.
                  </div>
                ) : null}
                <ToolWidgetRenderer
                  key={`${selectedTool.name}:${selectedToolRun.id}`}
                  toolName={selectedTool.name}
                  toolInput={selectedToolRun.args}
                  toolResult={selectedToolRun.result}
                  resourceUri={selectedTool.uiBinding.resourceUri}
                  onError={setWidgetError}
                />
              </div>
            ) : selectedTool && isUiCapableTool(selectedTool) ? (
              <p className="text-xs text-slate-500">Run this tool successfully to render its embedded widget.</p>
            ) : null}
          </div>
          <div className="min-h-0 overflow-auto">
            <h3 className="mb-2 text-sm font-semibold">Run history</h3>
            <div className="space-y-2">
              {runHistory.map((run) => (
                <div key={run.id} className="rounded-md border border-slate-200 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{run.toolName}</span>
                    <span className={run.status === "success" ? "text-emerald-700" : "text-red-700"}>{run.status}</span>
                  </div>
                  <div className="text-slate-600">{new Date(run.timestamp).toLocaleString()}</div>
                  <div className="truncate text-slate-500">{run.inputSummary}</div>
                </div>
              ))}
              {runHistory.length === 0 && <p className="text-xs text-slate-500">No runs yet.</p>}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
