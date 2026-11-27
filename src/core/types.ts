export type HighlightColor = "yellow" | "cyan" | "green";

export interface EpubChapter {
  index: number;
  id: string;
  href: string;
  title: string;
  wordCount: number;
  text: string;
  html: string;
}

export interface EpubBook {
  title: string;
  author: string;
  language: string;
  chapterCount: number;
  chapters: EpubChapter[];
}

export interface SearchMatch {
  chapterIndex: number;
  chapterTitle: string;
  href: string;
  excerpt: string;
}

export interface HighlightEntry {
  id: string;
  bookId: string;
  cfiRange: string;
  text: string;
  note: string;
  color: HighlightColor;
  chapterTitle: string;
  chapterIndex: number | null;
  createdAt: string;
}

export interface BookHighlightStore {
  highlights: HighlightEntry[];
  lastCfi: string | null;
}

export interface HighlightStoreData {
  books: Record<string, BookHighlightStore>;
}
