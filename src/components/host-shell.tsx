"use client";

import { useEffect, useMemo, useState } from "react";
import { hostClient } from "@/lib/host-client";
import type { MCPToolDescriptor, MCPToolRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToolWidgetRenderer } from "@/components/tool-widget-renderer";

function hasUi(tool: MCPToolDescriptor): tool is MCPToolDescriptor & { uiBinding: { resourceUri: string } } {
  return Boolean(tool.uiBinding?.resourceUri);
}

function buildInitialArgs(tool?: MCPToolDescriptor) {
  if (!tool || !tool.inputSchema || typeof tool.inputSchema !== "object") {
    return {} as Record<string, unknown>;
  }

  const schema = tool.inputSchema as { properties?: Record<string, { default?: unknown }> };
  const properties = schema.properties ?? {};

  return Object.fromEntries(
    Object.entries(properties).map(([key, prop]) => [key, prop.default ?? ""]),
  ) as Record<string, unknown>;
}

export function HostShell() {
  const [tools, setTools] = useState<MCPToolDescriptor[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [runs, setRuns] = useState<MCPToolRun[]>([]);
  const [resourceContents, setResourceContents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const filteredTools = useMemo(() => {
    const needle = search.toLowerCase();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        (tool.title ?? "").toLowerCase().includes(needle) ||
        (tool.description ?? "").toLowerCase().includes(needle),
    );
  }, [search, tools]);

  useEffect(() => {
    if (!selectedTool || !hasUi(selectedTool)) {
      setResourceContents(null);
      return;
    }

    void (async () => {
      try {
        const data = await hostClient.readResource(selectedTool.uiBinding.resourceUri);
        setResourceContents(data.text ?? data.blob ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read widget resource");
      }
    })();
  }, [selectedTool]);

  const runTool = async () => {
    if (!selectedTool) {
      return;
    }

    try {
      const data = await hostClient.callTool(selectedTool.name, args);
      setRuns((previous) => [data.run, ...previous]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tool call failed");
    }
  };

  const rerunLast = async () => {
    const last = runs.find((run) => run.succeeded && run.toolName === selectedTool?.name);
    if (!last) {
      return;
    }
    setArgs(last.args);
    await runTool();
  };

  const renderForm = () => {
    const properties =
      (selectedTool?.inputSchema?.properties as Record<string, { type?: string; enum?: string[] }> | undefined) ?? {};

    const entries = Object.entries(properties);

    if (entries.length === 0) {
      return <p className="text-sm text-slate-500">This tool does not require inputs.</p>;
    }

    return (
      <div className="space-y-3">
        {entries.map(([key, prop]) => (
          <div key={key} className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor={`input-${key}`}>
              {key}
            </label>
            {prop.enum ? (
              <select
                id={`input-${key}`}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                value={String(args[key] ?? "")}
                onChange={(event) => setArgs((prev) => ({ ...prev, [key]: event.target.value }))}
              >
                {prop.enum.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : prop.type === "string" ? (
              <Input
                id={`input-${key}`}
                value={String(args[key] ?? "")}
                onChange={(event) => setArgs((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            ) : (
              <Textarea
                id={`input-${key}`}
                value={JSON.stringify(args[key] ?? "", null, 2)}
                onChange={(event) => setArgs((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const latestRun = runs[0] ?? null;

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
            {filteredTools.map((tool) => (
              <button
                key={tool.name}
                className={`w-full rounded-md border p-2 text-left text-sm ${
                  selectedToolName === tool.name ? "border-slate-500 bg-slate-100" : "border-slate-200"
                }`}
                onClick={() => {
                  setSelectedToolName(tool.name);
                  setArgs(buildInitialArgs(tool));
                }}
              >
                <div className="font-medium">{tool.title ?? tool.name}</div>
                <div className="text-xs text-slate-500">{tool.description ?? tool.name}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="col-span-5 space-y-4 p-4">
          <div>
            <h2 className="font-semibold">{selectedTool?.title ?? "Select a tool"}</h2>
            <p className="text-sm text-slate-600">{selectedTool?.description ?? "No tool selected."}</p>
          </div>
          {renderForm()}
          <div className="flex gap-2">
            <Button onClick={() => void runTool()} disabled={!selectedTool}>
              Run tool
            </Button>
            <Button onClick={() => void rerunLast()} disabled={!selectedTool}>
              Re-run last successful
            </Button>
          </div>
        </Card>

        <Card className="col-span-4 grid grid-rows-2 gap-3 p-3">
          <div className="min-h-0 overflow-auto">
            <h3 className="mb-2 text-sm font-semibold">Result / Widget</h3>
            {selectedTool && hasUi(selectedTool) && resourceContents ? (
              <ToolWidgetRenderer
                resourceUri={selectedTool.uiBinding.resourceUri}
                resourceContents={resourceContents}
              />
            ) : (
              <pre className="rounded-md bg-slate-100 p-2 text-xs text-slate-800">
                {JSON.stringify(latestRun?.result ?? { message: "Run a tool to see result" }, null, 2)}
              </pre>
            )}
          </div>
          <div className="min-h-0 overflow-auto">
            <h3 className="mb-2 text-sm font-semibold">Run history</h3>
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="rounded-md border border-slate-200 p-2 text-xs">
                  <div className="font-medium">{run.toolName}</div>
                  <div className="text-slate-600">{new Date(run.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {runs.length === 0 && <p className="text-xs text-slate-500">No runs yet.</p>}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
