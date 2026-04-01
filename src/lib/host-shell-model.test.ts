import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConnectionConfig,
  createRunHistoryItem,
  filterTools,
  getConnectionStatusMessage,
  getNextSelectionState,
  getTransportLabel,
  parseEnvText,
  parseCommandArgs,
  parseHeadersText,
  serializeFallbackResult,
  validateConnectionConfig,
} from "@/lib/host-shell-model";
import { makeTool, makeUiTool } from "@/test-utils/fixtures";

const emptyHttp = { headersText: "", authToken: "", requestTimeoutMsText: "" };
const emptyStdioTimeouts = { startupTimeoutMsText: "", requestTimeoutMsText: "" };

test("tool list filtering and selection state reset behavior", () => {
  const tools = [
    makeTool({ name: "echo.text", title: "Echo Text", description: "text utility" }),
    makeUiTool({ name: "stocks.chart", title: "Stock Chart", description: "chart ui", inputSchema: undefined }),
  ];

  assert.equal(filterTools(tools, "echo").length, 1);
  assert.equal(filterTools(tools, "chart").length, 1);
  assert.equal(filterTools(tools, "ui").length, 1);
  assert.equal(filterTools(tools, "").length, 2);

  const selected = getNextSelectionState(tools, "stocks.chart");
  assert.equal(selected.selectedToolName, "stocks.chart");
  assert.deepEqual(selected.args, {});

  const missing = getNextSelectionState(tools, "missing");
  assert.equal(missing.selectedToolName, null);
  assert.deepEqual(missing.args, {});
});

test("connection form model switches transport fields and validates command/url", () => {
  const httpConfig = buildConnectionConfig("streamable-http", "http://localhost:3001/mcp", {
    command: "",
    argsText: "",
    cwd: "",
    envText: "",
    ...emptyStdioTimeouts,
  }, emptyHttp);
  assert.equal(httpConfig.type, "streamable-http");
  assert.equal(validateConnectionConfig(httpConfig), null);
  assert.equal(validateConnectionConfig(buildConnectionConfig("streamable-http", "localhost:3001/mcp", { command: "", argsText: "", cwd: "", envText: "", ...emptyStdioTimeouts }, emptyHttp)), "MCP server URL must start with http:// or https://.");
  assert.equal(validateConnectionConfig(buildConnectionConfig("streamable-http", "ftp://localhost", { command: "", argsText: "", cwd: "", envText: "", ...emptyStdioTimeouts }, emptyHttp)), "MCP server URL must start with http:// or https://.");

  const stdioConfig = buildConnectionConfig("stdio", "", {
    command: "node",
    argsText: "server.js --stdio --name \"quoted value\"",
    cwd: "/tmp",
    envText: "FOO=bar\nEMPTY=",
    startupTimeoutMsText: "8000",
    requestTimeoutMsText: "12000",
  }, emptyHttp);
  assert.equal(stdioConfig.type, "stdio");
  assert.deepEqual(stdioConfig.args, ["server.js", "--stdio", "--name", "quoted value"]);
  assert.deepEqual(stdioConfig.env, { FOO: "bar", EMPTY: "" });
  assert.equal(stdioConfig.startupTimeoutMs, 8000);
  assert.equal(stdioConfig.requestTimeoutMs, 12000);
  assert.equal(validateConnectionConfig(stdioConfig), null);

  const invalid = buildConnectionConfig("stdio", "", {
    command: "",
    argsText: "",
    cwd: "",
    envText: "",
    ...emptyStdioTimeouts,
  }, emptyHttp);
  assert.equal(validateConnectionConfig(invalid), "Command is required for local STDIO transport.");
  assert.deepEqual(parseEnvText("A=1\nB=two"), { A: "1", B: "two" });
});

test("http advanced config parsing supports headers/auth/timeout", () => {
  const httpConfig = buildConnectionConfig("streamable-http", "https://mcp.example.com/mcp", {
    command: "",
    argsText: "",
    cwd: "",
    envText: "",
    ...emptyStdioTimeouts,
  }, {
    headersText: "X-API-Key: abc\nX-Trace: req-1",
    authToken: "secret-token",
    requestTimeoutMsText: "20000",
  });

  assert.equal(httpConfig.type, "streamable-http");
  assert.deepEqual(httpConfig.headers, { "X-API-Key": "abc", "X-Trace": "req-1" });
  assert.equal(httpConfig.authToken, "secret-token");
  assert.equal(httpConfig.requestTimeoutMs, 20000);
  assert.equal(validateConnectionConfig(httpConfig), null);
  assert.deepEqual(parseHeadersText("A: 1\nB: two"), { A: "1", B: "two" });
});

test("transport switch preserves only intended fields across HTTP and STDIO", () => {
  const stdioConfig = buildConnectionConfig("stdio", "http://unused", {
    command: "node",
    argsText: "server.js",
    cwd: "/workspace/MCP-UI",
    envText: "A=1",
    ...emptyStdioTimeouts,
  }, emptyHttp);
  assert.equal(stdioConfig.type, "stdio");
  assert.equal("url" in stdioConfig, false);

  const httpConfig = buildConnectionConfig("streamable-http", "http://localhost:3001/mcp", {
    command: "node",
    argsText: "server.js",
    cwd: "/workspace/MCP-UI",
    envText: "A=1",
    ...emptyStdioTimeouts,
  }, emptyHttp);
  assert.equal(httpConfig.type, "streamable-http");
  assert.equal("command" in httpConfig, false);
});

test("stdio validation messaging is actionable for missing required fields", () => {
  const missingCommand = buildConnectionConfig("stdio", "", {
    command: "",
    argsText: "--stdio",
    cwd: "",
    envText: "TOKEN=abc",
    ...emptyStdioTimeouts,
  }, emptyHttp);
  assert.equal(validateConnectionConfig(missingCommand), "Command is required for local STDIO transport.");
});

test("stdio args parsing and timeout validation are explicit", () => {
  assert.deepEqual(parseCommandArgs("--port 3333 --name \"demo app\""), ["--port", "3333", "--name", "demo app"]);
  assert.throws(() => parseCommandArgs("--name \"unterminated"));

  assert.throws(() => buildConnectionConfig("stdio", "", {
    command: "node",
    argsText: "server.js",
    cwd: "",
    envText: "",
    startupTimeoutMsText: "0",
    requestTimeoutMsText: "-10",
  }, emptyHttp));
});

test("run history metadata includes tool name/status/timestamp/input summary", () => {
  const history = createRunHistoryItem({
    id: "run-1",
    toolName: "echo.text",
    status: "success",
    args: { text: "hello", locale: "en" },
    timestamp: "2026-03-30T00:00:00.000Z",
  });

  assert.equal(history.toolName, "echo.text");
  assert.equal(history.status, "success");
  assert.equal(history.timestamp, "2026-03-30T00:00:00.000Z");
  assert.ok(history.inputSummary.includes('text="hello"'));
});

test("connection status labels are transport-aware and actionable", () => {
  assert.equal(getTransportLabel("streamable-http"), "Streamable HTTP");
  assert.equal(getTransportLabel("stdio"), "Local STDIO");
  assert.equal(getConnectionStatusMessage("disconnected", "stdio"), "No active connection. Configure a transport and connect to load tools.");
  assert.equal(getConnectionStatusMessage("connecting", "streamable-http"), "Connecting via Streamable HTTP…");
});

test("fallback renderer serialization supports plain text/json/array/empty/unexpected", () => {
  assert.deepEqual(serializeFallbackResult("ok"), { pretty: "ok", raw: '"ok"' });
  assert.equal(serializeFallbackResult({ ok: true }).pretty.includes("\n"), true);
  assert.equal(serializeFallbackResult([1, 2]).raw, "[1,2]");
  assert.equal(serializeFallbackResult(undefined).pretty, "No result data returned.");

  const weird = { toString() { return "[custom]"; } };
  assert.equal(serializeFallbackResult(weird).pretty.includes("custom") || serializeFallbackResult(weird).pretty.includes("{"), true);
});
