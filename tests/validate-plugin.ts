import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

interface PluginManifest {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  logo?: string;
  author?: unknown;
  suggestedPrompts?: string[];
}

interface McpConfig {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "plugin.json"), "utf8")
) as PluginManifest;

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) {
  throw new Error(`Invalid kebab-case plugin name: ${manifest.name}`);
}
if (/^(antigravity|gemini|claude|cursor)-/i.test(manifest.name)) {
  throw new Error(`Plugin name must not start with forbidden brand prefix: ${manifest.name}`);
}
if (!manifest.displayName || /\b(plugin|mcp)$/i.test(manifest.displayName)) {
  throw new Error(`displayName must exist and omit 'Plugin'/'MCP' suffix: ${manifest.displayName}`);
}
if (!manifest.description || !manifest.version || !manifest.logo || !manifest.author) {
  throw new Error("Missing required Marketplace fields in plugin.json");
}
if (
  !Array.isArray(manifest.suggestedPrompts) ||
  manifest.suggestedPrompts.length === 0 ||
  manifest.suggestedPrompts.length > 3
) {
  throw new Error("suggestedPrompts must contain 1 to 3 starter prompts");
}

const logoPath = path.join(ROOT, manifest.logo);
if (!fs.existsSync(logoPath)) {
  throw new Error(`Logo file missing: ${manifest.logo}`);
}

const skillMd = fs.readFileSync(path.join(ROOT, "skills/epub-reader/SKILL.md"), "utf8");
if (!/^name:\s*epub-reader\s*$/m.test(skillMd)) {
  throw new Error("skills/epub-reader/SKILL.md frontmatter name must match folder 'epub-reader'");
}

const mcpConfig = JSON.parse(
  fs.readFileSync(path.join(ROOT, "mcp_config.json"), "utf8")
) as McpConfig;
const serverCfg = mcpConfig.mcpServers?.server;
if (!serverCfg || serverCfg.command !== "node") {
  throw new Error("mcp_config.json must declare a local stdio server with 'command': 'node'");
}
if (serverCfg.env && (serverCfg.env.PLUGIN_ROOT || serverCfg.env.PLUGIN_DATA)) {
  throw new Error("mcp_config.json must not duplicate PLUGIN_ROOT or PLUGIN_DATA in env");
}

const serverScript = path.join(ROOT, "scripts/mcp-server.mjs");
const viewerHtml = path.join(ROOT, "scripts/viewer.html");
if (!fs.existsSync(serverScript) || !fs.existsSync(viewerHtml)) {
  throw new Error("Built runtime files in scripts/ are missing. Run 'npm run build'.");
}

const mode = fs.statSync(serverScript).mode;
if ((mode & 0o111) === 0) {
  throw new Error("scripts/mcp-server.mjs must have executable (0755) permissions");
}

const viewerSize = fs.statSync(viewerHtml).size;
if (viewerSize > 10 * 1024 * 1024) {
  throw new Error(`scripts/viewer.html exceeds 10 MiB limit (${viewerSize} bytes)`);
}
const viewerText = fs.readFileSync(viewerHtml, "utf8");
if (!viewerText.includes("Inlined JSZip") || !viewerText.includes("EPUB.js")) {
  throw new Error("scripts/viewer.html is missing the inlined JSZip + EPUB.js bundle");
}

console.log("✔ All Antigravity Marketplace & MCP App pre-publish validation checks passed.");
