import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { loadEpubBookFromFile } from "../adapters/epub-adapter.js";
import {
  VIEWER_RESOURCE_URI,
  getFileViewerToolMeta,
  getHostUiCapabilities,
  getSidePanelToolMeta
} from "../adapters/host-adapter.js";
import {
  listBookChapters,
  resolveBookChapter,
  searchEpubBook
} from "../core/book-service.js";
import { HighlightStore } from "../core/highlight-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveDataDir(argv: string[] = process.argv): string {
  const idx = argv.indexOf("--data-dir");
  if (idx !== -1 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]);
  }
  if (process.env.PLUGIN_DATA) {
    return path.resolve(process.env.PLUGIN_DATA);
  }
  return path.join(os.homedir(), ".gemini", "plugin-data", "epub-reader");
}

function getViewerHtml(): string {
  const bundledPath = path.resolve(__dirname, "viewer.html");
  if (fs.existsSync(bundledPath)) {
    return fs.readFileSync(bundledPath, "utf8");
  }
  const devPath = path.resolve(__dirname, "../ui/viewer.html");
  return fs.readFileSync(devPath, "utf8");
}

function findWorkspaceEpubFiles(): string[] {
  const searchRoots = [
    process.cwd(),
    "/workspaces/life_hub/music",
    "/workspaces/life_hub"
  ];
  const found = new Set<string>();
  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) {
          found.add(path.resolve(root, entry.name));
        }
      }
    } catch {
      // ignore unreadable directories
    }
  }
  return Array.from(found);
}

/**
 * Resolves either a full path or a bare filename (e.g. from the IDE `file` entrypoint `{ file: { name } }`)
 * to an existing `.epub` file in the workspace.
 */
function resolveEpubFilePath(filePathOrName?: string): string {
  if (filePathOrName && fs.existsSync(path.resolve(filePathOrName))) {
    return path.resolve(filePathOrName);
  }
  const discovered = findWorkspaceEpubFiles();
  if (filePathOrName) {
    const base = path.basename(filePathOrName).toLowerCase();
    const match = discovered.find((p) => path.basename(p).toLowerCase() === base);
    if (match) return match;
  }
  if (discovered.length > 0) {
    return discovered[0];
  }
  throw new Error(`EPUB file not found: ${String(filePathOrName || "(none)")}`);
}

export function createEpubMcpServer(options: { dataDir?: string } = {}): McpServer {
  const dataDir = options.dataDir || resolveDataDir();
  const store = new HighlightStore(dataDir);

  const server = new McpServer(
    {
      name: "epub-reader",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        extensions: getHostUiCapabilities()
      }
    }
  );

  // 1. Renderer View Resource (`ui://epub-reader/viewer.html`)
  registerAppResource(
    server,
    "EPUB Reader UI",
    VIEWER_RESOURCE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: VIEWER_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: getViewerHtml()
        }
      ]
    })
  );

  // 2. Host-Invoked Custom File Viewer Tool (`.epub` `file` entrypoint)
  server.registerTool(
    "open_epub_file",
    {
      description: "Host-invoked custom file viewer for .epub files in the IDE Side Panel.",
      inputSchema: {
        file: z
          .object({
            name: z.string().optional(),
            resourceUri: z.string().optional()
          })
          .optional()
      },
      _meta: getFileViewerToolMeta([".epub"])
    },
    async ({ file }) => {
      const label = file?.name || "EPUB Reader";
      let resolvedPath: string | null = null;
      try {
        resolvedPath = resolveEpubFilePath(file?.name);
      } catch {
        resolvedPath = null;
      }
      const { bookKey, data: bookData } = store.getBook(label);
      return {
        content: [
          {
            type: "text",
            text: `Opened EPUB Reader for ${label} (${bookData.highlights.length} saved highlights).`
          }
        ],
        structuredContent: {
          status: "ready",
          target: label,
          file: file || null,
          filePath: resolvedPath,
          bookId: bookKey,
          highlights: bookData.highlights,
          lastCfi: bookData.lastCfi
        }
      };
    }
  );

  // 3. Model-Callable Side Panel Viewer Tool (`aux_pane` & `global` entrypoints)
  server.registerTool(
    "open_epub_panel",
    {
      description: "Open the interactive EPUB Reader in the Side Panel for a workspace .epub file.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("Absolute or workspace-relative path to a local .epub file."),
        chapterIndex: z
          .number()
          .int()
          .optional()
          .describe("Optional 0-based chapter index to open directly.")
      },
      _meta: getSidePanelToolMeta("EPUB Reader")
    },
    async ({ filePath, chapterIndex }) => {
      let resolvedPath: string | null = null;
      try {
        resolvedPath = resolveEpubFilePath(filePath);
      } catch {
        resolvedPath = filePath || null;
      }
      const label = resolvedPath || "EPUB Reader";
      const { bookKey, data: bookData } = store.getBook(label);
      return {
        content: [
          {
            type: "text",
            text: `Opened EPUB Reader for ${label} (${bookData.highlights.length} saved highlights).`
          }
        ],
        structuredContent: {
          status: "ready",
          target: label,
          filePath: resolvedPath,
          chapterIndex: chapterIndex ?? 10,
          availableBooks: findWorkspaceEpubFiles(),
          bookId: bookKey,
          highlights: bookData.highlights,
          lastCfi: bookData.lastCfi
        }
      };
    }
  );

  // 4. List Chapters & Metadata Tool (Adapter -> Domain Object -> Business Logic)
  server.registerTool(
    "epub_list_chapters",
    {
      description:
        "Parse an EPUB book and return its metadata (title, author) and numbered Table of Contents.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("Path or filename of the local .epub file.")
      }
    },
    async ({ filePath }) => {
      const targetPath = resolveEpubFilePath(filePath);
      const book = await loadEpubBookFromFile(targetPath);
      const tocSummary = listBookChapters(book);
      const lines = [
        `# ${book.title}`,
        `**Author:** ${book.author} · **Language:** ${book.language} · **Chapters:** ${book.chapterCount}`,
        "",
        ...tocSummary.map((c) => `${c.index}. **${c.title}** (\`${c.href}\` — ${c.wordCount} words)`)
      ];
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          filePath: targetPath,
          title: book.title,
          author: book.author,
          language: book.language,
          chapterCount: book.chapterCount,
          chapters: tocSummary
        }
      };
    }
  );

  // 5. Read Chapter Tool (Adapter -> Domain Object -> Business Logic)
  server.registerTool(
    "epub_read_chapter",
    {
      description:
        "Read the text and HTML content of a specific chapter from an EPUB book by 0-based chapterIndex or href.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("Path or filename of the local .epub file."),
        chapterIndex: z
          .number()
          .int()
          .optional()
          .describe("0-based chapter index from epub_list_chapters."),
        href: z.string().optional().describe("Optional chapter href from epub_list_chapters.")
      }
    },
    async ({ filePath, chapterIndex, href }) => {
      const targetPath = resolveEpubFilePath(filePath);
      const book = await loadEpubBookFromFile(targetPath);
      const chapter = resolveBookChapter(book, { chapterIndex, href });
      return {
        content: [
          {
            type: "text",
            text: `# [${chapter.index}] ${chapter.title}\n\n${chapter.text}`
          }
        ],
        structuredContent: {
          filePath: targetPath,
          bookTitle: book.title,
          index: chapter.index,
          title: chapter.title,
          href: chapter.href,
          wordCount: chapter.wordCount,
          text: chapter.text,
          html: chapter.html
        }
      };
    }
  );

  // 6. Full-Text Search Tool (Adapter -> Domain Object -> Business Logic)
  server.registerTool(
    "epub_search",
    {
      description:
        "Search across all chapters of an EPUB book for a keyword or phrase and return matching passages with chapter references.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("Path or filename of the local .epub file."),
        query: z.string().describe("Case-insensitive keyword or phrase to search for."),
        maxResults: z
          .number()
          .int()
          .optional()
          .describe("Maximum number of matching excerpts to return (default: 15).")
      }
    },
    async ({ filePath, query, maxResults }) => {
      const targetPath = resolveEpubFilePath(filePath);
      const book = await loadEpubBookFromFile(targetPath);
      const matches = searchEpubBook(book, query, maxResults ?? 15);
      const formatted = matches.length
        ? matches
            .map(
              (m, i) =>
                `${i + 1}. **[Chapter ${m.chapterIndex}: ${m.chapterTitle}]** (\`${m.href}\`)\n   > ${m.excerpt}`
            )
            .join("\n\n")
        : `No matches found for "${query}" in ${book.title}.`;

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          bookTitle: book.title,
          query,
          matchCount: matches.length,
          matches
        }
      };
    }
  );

  // 7. Save Highlight & Bookmark Tool
  server.registerTool(
    "epub_save_highlight",
    {
      description:
        "Persist a highlighted passage, EPUB CFI range, color tag, and optional note for an EPUB book.",
      inputSchema: {
        bookId: z.string().describe("Book filename or identifier (e.g., 'Mixing_Secrets.epub')."),
        cfiRange: z
          .string()
          .optional()
          .describe("EPUB Canonical Fragment Identifier (epubcfi(...)) or section anchor."),
        text: z.string().describe("The highlighted passage text."),
        note: z.string().optional().describe("Optional user annotation or study note."),
        color: z
          .enum(["yellow", "cyan", "green"])
          .optional()
          .describe("Highlight color category (yellow = concept, cyan = technical spec, green = action)."),
        chapterTitle: z
          .string()
          .optional()
          .describe("Chapter title where the highlight was made."),
        chapterIndex: z.number().int().optional().describe("Optional 0-based chapter index.")
      }
    },
    async ({ bookId, cfiRange, text, note, color, chapterTitle, chapterIndex }) => {
      const { entry, totalHighlights } = store.addHighlight({
        bookId,
        cfiRange,
        text,
        note,
        color,
        chapterTitle,
        chapterIndex: chapterIndex ?? null
      });

      return {
        content: [
          {
            type: "text",
            text: `Saved [${entry.color}] highlight in ${entry.bookId} (${entry.chapterTitle}): "${entry.text}"`
          }
        ],
        structuredContent: {
          highlight: entry,
          totalHighlights
        }
      };
    }
  );

  // 8. List Highlights Tool
  server.registerTool(
    "epub_list_highlights",
    {
      description: "List all saved highlights, annotations, and reading progress for an EPUB book.",
      inputSchema: {
        bookId: z
          .string()
          .optional()
          .describe("Optional book filename or identifier to filter highlights.")
      }
    },
    async ({ bookId }) => {
      if (bookId) {
        const { bookKey, data: bookData } = store.getBook(bookId);
        const text = bookData.highlights.length
          ? bookData.highlights
              .map(
                (h, i) =>
                  `${i + 1}. **[${h.color.toUpperCase()}] ${h.chapterTitle}**: "${h.text}"${
                    h.note ? `\n   - *Note:* ${h.note}` : ""
                  }`
              )
              .join("\n")
          : `No saved highlights for ${bookKey}.`;
        return {
          content: [{ type: "text", text }],
          structuredContent: {
            bookId: bookKey,
            lastCfi: bookData.lastCfi,
            highlights: bookData.highlights
          }
        };
      }
      const allData = store.loadAll();
      return {
        content: [
          {
            type: "text",
            text: `Loaded highlights store across ${Object.keys(allData.books).length} book(s).`
          }
        ],
        structuredContent: allData as unknown as Record<string, unknown>
      };
    }
  );

  // 9. Export Highlights as Markdown Study Guide Tool
  server.registerTool(
    "epub_export_highlights_markdown",
    {
      description:
        "Export saved EPUB highlights and notes into a structured Markdown study guide, optionally saving directly to a workspace file.",
      inputSchema: {
        bookId: z.string().describe("Book filename or identifier."),
        outputPath: z
          .string()
          .optional()
          .describe("Optional file path where the Markdown study guide should be written.")
      }
    },
    async ({ bookId, outputPath }) => {
      const exported = store.exportMarkdown(bookId, outputPath);
      return {
        content: [{ type: "text", text: exported.markdown }],
        structuredContent: {
          bookId: exported.bookKey,
          highlightCount: exported.highlightCount,
          outputPath: exported.outputPath,
          markdown: exported.markdown
        }
      };
    }
  );

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = resolveDataDir(process.argv);
  const server = createEpubMcpServer({ dataDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
