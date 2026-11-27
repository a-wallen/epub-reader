import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

interface PluginManifest {
  name: string;
  version?: string;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "plugin.json"), "utf8")
) as PluginManifest;
const version = manifest.version || "0.1.0";
const distDir = path.join(ROOT, "dist");
fs.mkdirSync(distDir, { recursive: true });

const zipFileName = `${manifest.name}-v${version}.zip`;
const zipFilePath = path.join(distDir, zipFileName);
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

fs.chmodSync(path.join(ROOT, "scripts/mcp-server.mjs"), 0o755);

const runtimeFiles = [
  "plugin.json",
  "mcp_config.json",
  "README.md",
  "LICENSE",
  "assets/logo.svg",
  "scripts/mcp-server.mjs",
  "scripts/viewer.html",
  "skills/epub-reader/SKILL.md"
];

execFileSync("zip", ["-r", "-q", zipFilePath, ...runtimeFiles], { cwd: ROOT });

const zipBuf = fs.readFileSync(zipFilePath);
const sha256 = crypto.createHash("sha256").update(zipBuf).digest("hex");
const shaFilePath = `${zipFilePath}.sha256`;
fs.writeFileSync(shaFilePath, `${sha256}  ${zipFileName}\n`, "utf8");

console.log(`✔ Packaged Marketplace release: ${zipFilePath} (${zipBuf.length} bytes)`);
console.log(`✔ SHA-256: ${sha256}`);
