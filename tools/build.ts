import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const scriptsDir = path.join(ROOT, "scripts");
fs.mkdirSync(scriptsDir, { recursive: true });

const serverOut = path.join(scriptsDir, "mcp-server.mjs");

// 1. Compile and bundle TypeScript MCP server (src/mcp/server.ts) -> scripts/mcp-server.mjs
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/mcp/server.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: serverOut,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);"
    ].join("\n")
  }
});
fs.chmodSync(serverOut, 0o755);

// 2. Compile TypeScript UI client (src/ui/client.ts with @modelcontextprotocol/ext-apps App) -> IIFE bundle
const clientResult = esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/ui/client.ts")],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  write: false
});
const clientJs = clientResult.outputFiles[0].text.replace(/<\/script>/gi, "<\\/script>");

// 3. Bundle jszip.min.js + epub.min.js + compiled client.ts into single-file scripts/viewer.html
const uiTemplate = fs.readFileSync(path.join(ROOT, "src/ui/viewer.html"), "utf8");
const jszipPath = path.join(ROOT, "node_modules/jszip/dist/jszip.min.js");
const epubjsPath = path.join(ROOT, "node_modules/epubjs/dist/epub.min.js");

if (!fs.existsSync(jszipPath) || !fs.existsSync(epubjsPath)) {
  throw new Error("Missing node_modules/jszip or node_modules/epubjs. Run 'npm install' before 'npm run build'.");
}

const jszipMin = fs.readFileSync(jszipPath, "utf8").replace(/<\/script>/gi, "<\\/script>");
const epubMin = fs.readFileSync(epubjsPath, "utf8").replace(/<\/script>/gi, "<\\/script>");
const vendorBundle = `/* Inlined JSZip 3.10.1 + EPUB.js 0.3.93 */\n${jszipMin}\n;\n${epubMin}\n`;

const bundledUi = uiTemplate
  .replace("/* __INJECT_VENDOR_BUNDLE__ */", () => vendorBundle)
  .replace("/* __INJECT_CLIENT_BUNDLE__ */", () => clientJs);

const uiOut = path.join(scriptsDir, "viewer.html");
fs.writeFileSync(uiOut, bundledUi, "utf8");

console.log(
  `Built scripts/mcp-server.mjs (${fs.statSync(serverOut).size} bytes) and scripts/viewer.html (${fs.statSync(uiOut).size} bytes)`
);
