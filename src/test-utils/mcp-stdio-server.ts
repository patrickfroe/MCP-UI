const tools = [
  {
    name: "echo.text",
    title: "Echo",
    description: "Echo text",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "stocks.chart",
    title: "Stock chart",
    _meta: { ui: { resourceUri: "ui://stocks/chart" } },
  },
];

let buffer = "";

function send(id: string, result: unknown) {
  const payload = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function sendError(id: string, message: string) {
  const payload = JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function handleMessage(raw: string) {
  const msg = JSON.parse(raw) as { id: string; method: string; params?: Record<string, unknown> };
  if (process.env.MCP_STDIO_EXIT_ON_MESSAGE === "1") {
    process.stderr.write("intentional exit\n");
    process.exit(17);
  }
  if (msg.method === "initialize") {
    if (process.env.MCP_STDIO_DELAY_INIT_MS) {
      setTimeout(() => send(msg.id, { serverInfo: { name: "fixture" } }), Number(process.env.MCP_STDIO_DELAY_INIT_MS));
      return;
    }
    send(msg.id, { serverInfo: { name: "fixture" } });
    return;
  }
  if (msg.method === "tools/list") {
    send(msg.id, { tools });
    return;
  }
  if (msg.method === "tools/call") {
    send(msg.id, { content: [{ type: "text", text: String(msg.params?.arguments ? (msg.params.arguments as Record<string, unknown>).text ?? "" : "") }] });
    return;
  }
  if (msg.method === "resources/read") {
    send(msg.id, { contents: [{ mimeType: "text/html", text: "<html>widget</html>" }] });
    return;
  }
  sendError(msg.id, `Unknown method ${msg.method}`);
}

process.stdin.on("data", (chunk) => {
  buffer += String(chunk);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = "";
      return;
    }
    const length = Number(match[1]);
    const total = headerEnd + 4 + length;
    if (buffer.length < total) return;
    const body = buffer.slice(headerEnd + 4, total);
    buffer = buffer.slice(total);
    handleMessage(body);
  }
});
