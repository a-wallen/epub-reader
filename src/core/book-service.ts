import type { EpubBook, EpubChapter, SearchMatch } from "./types.js";

/**
 * Pure Business Logic for `EpubBook` domain objects (`src/core/book-service.ts`).
 *
 * Operates strictly on the `EpubBook` object produced by `src/adapters/epub-adapter.ts`
 * with zero file-system, ZIP, or HTML parsing concerns.
 */
export function listBookChapters(book: EpubBook) {
  return book.chapters.map((ch) => ({
    index: ch.index,
    id: ch.id,
    title: ch.title,
    href: ch.href,
    wordCount: ch.wordCount
  }));
}

export function resolveBookChapter(
  book: EpubBook,
  selector: { chapterIndex?: number; href?: string }
): EpubChapter {
  const { chapterIndex, href } = selector;
  let chapter: EpubChapter | undefined;

  if (typeof chapterIndex === "number") {
    chapter = book.chapters[chapterIndex];
  } else if (href) {
    const clean = href.split("#")[0];
    chapter = book.chapters.find((c) => c.href === clean || c.href.endsWith(clean));
  } else {
    chapter = book.chapters[0];
  }

  if (!chapter) {
    throw new Error(
      `Chapter not found (chapterIndex=${String(chapterIndex)}, href=${String(href)})`
    );
  }
  return chapter;
}

export function searchEpubBook(
  book: EpubBook,
  query: string,
  maxResults = 15
): SearchMatch[] {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Search query must not be empty");
  }
  const qLower = trimmed.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const ch of book.chapters) {
    const paragraphs = ch.text.split(/\n{2,}/);
    for (const para of paragraphs) {
      if (para.toLowerCase().includes(qLower)) {
        const cleanPara = para.replace(/\s+/g, " ").trim();
        matches.push({
          chapterIndex: ch.index,
          chapterTitle: ch.title,
          href: ch.href,
          excerpt: cleanPara.length > 420 ? cleanPara.slice(0, 420) + "..." : cleanPara
        });
        if (matches.length >= maxResults) break;
      }
    }
    if (matches.length >= maxResults) break;
  }

  return matches;
}
