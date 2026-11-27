import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  BookHighlightStore,
  HighlightColor,
  HighlightEntry,
  HighlightStoreData
} from "./types.js";

/**
 * IDE-agnostic persistence and Markdown export engine for EPUB highlights & bookmarks.
 */
export class HighlightStore {
  private readonly storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(this.dataDir, "highlights.json");
  }

  public static normalizeBookKey(bookId: unknown): string {
    return path.basename(String(bookId || "default.epub"));
  }

  public loadAll(): HighlightStoreData {
    if (!fs.existsSync(this.storePath)) {
      return { books: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.storePath, "utf8")) as HighlightStoreData;
    } catch {
      return { books: {} };
    }
  }

  private saveAll(store: HighlightStoreData): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
  }

  public getBook(bookId: unknown): { bookKey: string; data: BookHighlightStore } {
    const bookKey = HighlightStore.normalizeBookKey(bookId);
    const store = this.loadAll();
    const data = store.books[bookKey] || { highlights: [], lastCfi: null };
    return { bookKey, data };
  }

  public addHighlight(input: {
    bookId: unknown;
    cfiRange?: string;
    text: string;
    note?: string;
    color?: string;
    chapterTitle?: string;
    chapterIndex?: number | null;
  }): { entry: HighlightEntry; totalHighlights: number } {
    const bookKey = HighlightStore.normalizeBookKey(input.bookId);
    const store = this.loadAll();
    if (!store.books[bookKey]) {
      store.books[bookKey] = { highlights: [], lastCfi: null };
    }
    const rawColor = String(input.color || "yellow");
    const color: HighlightColor =
      rawColor === "cyan" || rawColor === "green" ? rawColor : "yellow";

    const entry: HighlightEntry = {
      id: crypto.randomUUID(),
      bookId: bookKey,
      cfiRange: typeof input.cfiRange === "string" ? input.cfiRange : "",
      text: String(input.text || "").trim(),
      note: typeof input.note === "string" ? input.note.trim() : "",
      color,
      chapterTitle:
        typeof input.chapterTitle === "string" && input.chapterTitle
          ? input.chapterTitle
          : "Unknown Chapter",
      chapterIndex: typeof input.chapterIndex === "number" ? input.chapterIndex : null,
      createdAt: new Date().toISOString()
    };

    store.books[bookKey].highlights.push(entry);
    if (entry.cfiRange) {
      store.books[bookKey].lastCfi = entry.cfiRange;
    }
    this.saveAll(store);

    return {
      entry,
      totalHighlights: store.books[bookKey].highlights.length
    };
  }

  public exportMarkdown(
    bookId: unknown,
    outputPath?: string
  ): { bookKey: string; highlightCount: number; outputPath: string | null; markdown: string } {
    const { bookKey, data } = this.getBook(bookId);
    const mdLines: string[] = [
      `# Study Highlights & Notes — ${bookKey}`,
      "",
      `**Exported:** \`${new Date().toISOString().slice(0, 10)}\` · **Total Highlights:** \`${data.highlights.length}\``,
      ""
    ];

    const colorLabels: Record<HighlightColor, string> = {
      yellow: "Core Concept",
      cyan: "Technical Spec / Parameter",
      green: "Action / Workflow Check"
    };

    for (const h of data.highlights) {
      const tag = colorLabels[h.color] || h.color;
      mdLines.push(`### ${h.chapterTitle} — *${tag}*`);
      mdLines.push(`> "${h.text}"`);
      if (h.note) {
        mdLines.push("");
        mdLines.push(`- **Note:** ${h.note}`);
      }
      if (h.cfiRange) {
        mdLines.push(`- **CFI:** \`${h.cfiRange}\``);
      }
      mdLines.push("");
    }

    const markdown = mdLines.join("\n");
    let resolvedOut: string | null = null;
    if (typeof outputPath === "string" && outputPath) {
      resolvedOut = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
      fs.writeFileSync(resolvedOut, markdown, "utf8");
    }

    return {
      bookKey,
      highlightCount: data.highlights.length,
      outputPath: resolvedOut,
      markdown
    };
  }
}
