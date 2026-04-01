import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("dist");
await mkdir(outDir, { recursive: true });

const outfile = path.join(outDir, "mcp-app.bundle.js");
const cssfile = path.join(outDir, "mcp-app.bundle.css");

await build({
  entryPoints: ["src/mcp-app/mcp-app.tsx"],
  bundle: true,
  format: "esm",
  outfile,
  minify: true,
  loader: { ".css": "css" },
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  alias: { "@": path.resolve("src") },
  logLevel: "silent",
});

const [js, css] = await Promise.all([readFile(outfile, "utf8"), readFile(cssfile, "utf8")]);

const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>MCP App</title><style>${css}</style></head><body><div id="app"></div><script type="module">${js}</script></body></html>`;
await writeFile(path.join(outDir, "mcp-app.html"), html, "utf8");

await Promise.all([rm(outfile, { force: true }), rm(cssfile, { force: true })]);
