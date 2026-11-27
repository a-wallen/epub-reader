import path from "node:path";
import { initEpubFile } from "@lingo-reader/epub-parser";
import { convert } from "html-to-text";
import type { EpubBook, EpubChapter } from "../core/types.js";

/**
 * IDE -> Domain Object Adapter (`src/adapters/epub-adapter.ts`)
 *
 * Uses off-the-shelf `@lingo-reader/epub-parser` and `html-to-text` to translate
 * an EPUB file supplied by the IDE into a clean `EpubBook` domain object for core business logic.
 */
export async function loadEpubBookFromFile(filePath: string): Promise<EpubBook> {
  const resolved = path.resolve(filePath);
  const epub = await initEpubFile(resolved);

  try {
    const metadata = epub.getMetadata();
    const spine = epub.getSpine();
    const toc = epub.getToc();

    // Map TOC hrefs -> human-readable chapter titles
    const tocMap = new Map<string, string>();
    const collectToc = (items: typeof toc) => {
      for (const item of items) {
        const cleanHref = item.href.split("#")[0];
        if (cleanHref && item.label) {
          tocMap.set(cleanHref, item.label.trim());
        }
        if (item.children?.length) {
          collectToc(item.children);
        }
      }
    };
    collectToc(toc);

    const chapters: EpubChapter[] = [];
    for (let idx = 0; idx < spine.length; idx++) {
      const item = spine[idx];
      const processed = await epub.loadChapter(item.id);
      const html = processed.html || "";
      const text = convert(html, {
        wordwrap: false,
        selectors: [
          { selector: "a", options: { ignoreHref: true } },
          { selector: "h1", options: { uppercase: false } },
          { selector: "h2", options: { uppercase: false } },
          { selector: "h3", options: { uppercase: false } }
        ]
      }).trim();

      const firstHeading = text.split("\n")[0]?.trim();
      const cleanHref = item.href.replace(/^epub:/, "");
      const title =
        tocMap.get(item.href) ||
        tocMap.get(cleanHref) ||
        firstHeading ||
        `Chapter ${idx + 1}`;
      const wordCount = text ? text.split(/\s+/).length : 0;

      chapters.push({
        index: idx,
        id: item.id,
        href: path.posix.basename(cleanHref),
        title,
        wordCount,
        text,
        html
      });
    }

    const creators = metadata.creator?.map((c) => c.contributor).filter(Boolean) || [];

    return {
      title: metadata.title || path.basename(resolved, ".epub"),
      author: creators.join(", ") || "Unknown Author",
      language: metadata.language || "en",
      chapterCount: chapters.length,
      chapters
    };
  } finally {
    epub.destroy();
  }
}
