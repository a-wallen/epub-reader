import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generateSampleEpub } from "./fixtures/generate-sample-epub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, "../scripts/mcp-server.mjs");
const SAMPLE_EPUB = path.resolve(__dirname, "fixtures/sample.epub");

await generateSampleEpub(SAMPLE_EPUB);

async function withMcpClient<T>(
  dataDir: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH, "--data-dir", dataDir]
  });
  const client = new Client({
    name: "epub-reader-test-client",
    version: "0.1.0"
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("EPUB Reader MCP Server: official SDK handshake, inlined epub.js UI resource, and .epub file entrypoint", async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "epub-mcp-test-"));

  await withMcpClient(tmpData, async (client) => {
    const serverVersion = client.getServerVersion();
    assert.equal(serverVersion?.name, "epub-reader");

    const { tools } = await client.listTools();
    assert.equal(tools.length, 8);

    const fileTool = tools.find((t) => t.name === "open_epub_file");
    assert.ok(fileTool, "open_epub_file should be registered via registerAppTool");
    const antigravityMeta = fileTool._meta?.["com.google.antigravity/ui"] as
      | { entrypoints?: Array<{ type: string; extensions?: string[] }> }
      | undefined;
    assert.equal(antigravityMeta?.entrypoints?.[0]?.type, "file");
    assert.deepEqual(antigravityMeta?.entrypoints?.[0]?.extensions, [".epub"]);

    const resourceRes = await client.readResource({ uri: "ui://epub-reader/viewer.html" });
    const htmlContent = resourceRes.contents[0] as { mimeType: string; text: string };
    assert.equal(htmlContent.mimeType, "text/html;profile=mcp-app");
    assert.ok(
      htmlContent.text.includes("Inlined JSZip 3.10.1 + EPUB.js 0.3.93"),
      "viewer.html should inline JSZip + EPUB.js"
    );
    assert.ok(
      htmlContent.text.includes("ui/message"),
      "viewer.html should support 1-click Quote to Chat"
    );
    assert.ok(Buffer.byteLength(htmlContent.text, "utf8") < 10 * 1024 * 1024);
  });
});

test("EPUB Reader MCP Tools: Zod-validated chapter listing, reading, search, and highlight persistence", async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "epub-mcp-tools-"));
  const exportMdPath = path.join(tmpData, "exported_highlights.md");

  await withMcpClient(tmpData, async (client) => {
    // 1. List chapters
    const tocRes = await client.callTool({
      name: "epub_list_chapters",
      arguments: { filePath: SAMPLE_EPUB }
    });
    const toc = tocRes.structuredContent as {
      title: string;
      chapterCount: number;
      chapters: Array<{ title: string }>;
    };
    assert.equal(toc.title, "Small Studio Mixing Reference Guide");
    assert.equal(toc.chapterCount, 3);
    assert.equal(toc.chapters[0].title, "Chapter 1: Small-Room Monitoring & Standing Waves");

    // 2. Read chapter 1 (Chapter 2)
    const chRes = await client.callTool({
      name: "epub_read_chapter",
      arguments: { filePath: SAMPLE_EPUB, chapterIndex: 1 }
    });
    const ch2 = chRes.structuredContent as { index: number; text: string };
    assert.equal(ch2.index, 1);
    assert.ok(ch2.text.includes("95 Hz"));

    // 3. Search across chapters
    const searchRes = await client.callTool({
      name: "epub_search",
      arguments: { filePath: SAMPLE_EPUB, query: "Fletcher-Munson" }
    });
    const searchData = searchRes.structuredContent as {
      matchCount: number;
      matches: Array<{ chapterIndex: number; excerpt: string }>;
    };
    assert.equal(searchData.matchCount, 1);
    assert.equal(searchData.matches[0].chapterIndex, 2);
    assert.ok(searchData.matches[0].excerpt.includes("minus 16 LUFS"));

    // 4. Save highlight
    const saveRes = await client.callTool({
      name: "epub_save_highlight",
      arguments: {
        bookId: "sample.epub",
        cfiRange: "epubcfi(/6/4[ch2]!/4/2/1:0)",
        text: "High-pass the side channel below 95 Hz with an 18 dB per octave slope",
        note: "Apply in Waves F6-RTA Band 1 Side mode",
        color: "cyan",
        chapterTitle: "Chapter 2: Midrange Balance & Surgical Dynamic EQ",
        chapterIndex: 1
      }
    });
    const saveData = saveRes.structuredContent as { totalHighlights: number };
    assert.equal(saveData.totalHighlights, 1);

    // 5. List highlights
    const listRes = await client.callTool({
      name: "epub_list_highlights",
      arguments: { bookId: "sample.epub" }
    });
    const listData = listRes.structuredContent as {
      lastCfi: string;
      highlights: Array<{ color: string }>;
    };
    assert.equal(listData.highlights.length, 1);
    assert.equal(listData.highlights[0].color, "cyan");
    assert.equal(listData.lastCfi, "epubcfi(/6/4[ch2]!/4/2/1:0)");

    // 6. Export Markdown
    const exportRes = await client.callTool({
      name: "epub_export_highlights_markdown",
      arguments: { bookId: "sample.epub", outputPath: exportMdPath }
    });
    const exportData = exportRes.structuredContent as { highlightCount: number };
    assert.equal(exportData.highlightCount, 1);
    assert.ok(fs.existsSync(exportMdPath));
    const exportedMd = fs.readFileSync(exportMdPath, "utf8");
    assert.ok(exportedMd.includes("Waves F6-RTA Band 1 Side mode"));
  });
});
