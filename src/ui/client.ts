import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables
} from "@modelcontextprotocol/ext-apps";

declare global {
  interface Window {
    JSZip?: {
      loadAsync(data: ArrayBuffer): Promise<JSZipInstance>;
    };
  }
}

interface JSZipFileEntry {
  dir: boolean;
  name: string;
  async(type: "string" | "base64"): Promise<string>;
}

interface JSZipInstance {
  file(name: string): JSZipFileEntry | null;
  files: Record<string, JSZipFileEntry>;
}

interface SavedHighlight {
  bookId: string;
  cfiRange: string;
  text: string;
  note?: string;
  color: "yellow" | "cyan" | "green";
  chapterTitle: string;
  chapterIndex: number;
}

interface ServerChapterSummary {
  index: number;
  id: string;
  title: string;
  href: string;
  wordCount: number;
}

const app = new App(
  { name: "EPUB Reader", version: "0.1.0" },
  {},
  { autoResize: true }
);

let isConnected = false;
let bookLoaded = false;
let queuedPayload: {
  file?: { name?: string; resourceUri?: string } | null;
  filePath?: string | null;
  chapterIndex?: number;
} | null = null;
let currentBookId = "Mixing_Secrets_for_the_Small_Studio.epub";
let currentFilePath: string | null = null;
let currentChapterTitle = "Chapter 1";
let currentChapterIndex = 0;
let fontSizePct = 100;
let pendingSelection: {
  text: string;
  cfiRange: string;
} | null = null;
let highlights: SavedHighlight[] = [];
let serverChapters: ServerChapterSummary[] = [];
let localZipChapters: Array<{ title: string; html: string }> = [];

function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

function renderHighlightsList(): void {
  const hlCount = getEl("hl-count");
  const hlList = getEl("highlights-list");
  hlCount.textContent = String(highlights.length);
  hlList.innerHTML = "";
  if (!highlights.length) {
    hlList.innerHTML =
      "<p style='font-size:12px;color:var(--muted-foreground)'>No saved highlights yet. Select text in the book to highlight.</p>";
    return;
  }
  highlights.forEach((h) => {
    const card = document.createElement("div");
    card.className = "highlight-card " + (h.color || "yellow");
    card.innerHTML =
      "<strong>" +
      (h.chapterTitle || "Chapter") +
      "</strong>" +
      "<span>“" +
      h.text +
      "”</span>" +
      (h.note ? "<em style='color:var(--muted-foreground)'>Note: " + h.note + "</em>" : "");
    card.onclick = () => {
      if (typeof h.chapterIndex === "number") {
        if (localZipChapters.length > 0) {
          renderLocalZipChapter(h.chapterIndex);
        } else {
          void loadServerChapter(h.chapterIndex);
        }
      }
    };
    hlList.appendChild(card);
  });
}

async function refreshSavedHighlights(): Promise<void> {
  if (!isConnected) return;
  try {
    const res = await app.callServerTool({
      name: "epub_list_highlights",
      arguments: { bookId: currentBookId }
    });
    const sc = res.structuredContent as { highlights?: SavedHighlight[] } | undefined;
    if (sc && Array.isArray(sc.highlights)) {
      highlights = sc.highlights;
      renderHighlightsList();
    }
  } catch {
    // ignore offline mode
  }
}

/**
 * Direct DOM EPUB Renderer using inlined JSZip + native DOMParser.
 * Avoids epub.js nested <iframe src="blob:..."> which is blocked by default-deny `frame-src 'none'` CSP.
 */
async function openWithDirectJsZip(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
  if (!window.JSZip) {
    throw new Error("JSZip bundle not available");
  }
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  const containerEntry = zip.file("META-INF/container.xml");
  if (!containerEntry) {
    throw new Error("Invalid EPUB: missing META-INF/container.xml");
  }
  const containerXml = await containerEntry.async("string");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path") || "OEBPS/content.opf";
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    throw new Error("Invalid EPUB: missing OPF at " + opfPath);
  }
  const opfXml = await opfEntry.async("string");
  const opfDoc = parser.parseFromString(opfXml, "application/xml");
  const titleEl = opfDoc.querySelector("title");
  currentBookId = fileName || "book.epub";
  getEl("book-title").textContent = titleEl?.textContent?.trim() || currentBookId;

  const manifestMap = new Map<string, string>();
  opfDoc.querySelectorAll("manifest > item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) {
      manifestMap.set(id, opfDir + href.split("#")[0]);
    }
  });

  localZipChapters = [];
  const itemrefs = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  for (let i = 0; i < itemrefs.length; i++) {
    const idref = itemrefs[i].getAttribute("idref") || "";
    const fullPath = manifestMap.get(idref);
    if (!fullPath) continue;
    const chEntry = zip.file(fullPath);
    if (!chEntry) continue;
    const rawHtml = await chEntry.async("string");
    const chDoc = parser.parseFromString(rawHtml, "text/html");
    const heading =
      chDoc.querySelector("h1, h2, h3, title")?.textContent?.trim() || `Section ${i + 1}`;
    localZipChapters.push({
      title: heading,
      html: chDoc.body ? chDoc.body.innerHTML : rawHtml
    });
  }

  bookLoaded = true;
  const tocList = getEl("toc-list");
  tocList.innerHTML = "";
  localZipChapters.forEach((ch, idx) => {
    const row = document.createElement("div");
    row.className = "toc-item";
    row.textContent = idx + ". " + ch.title;
    row.onclick = () => renderLocalZipChapter(idx);
    tocList.appendChild(row);
  });

  renderLocalZipChapter(0);
  await refreshSavedHighlights();
}

function renderLocalZipChapter(index: number): void {
  const ch = localZipChapters[index];
  if (!ch) return;
  currentChapterIndex = index;
  currentChapterTitle = ch.title;
  getEl("chapter-label").textContent = ch.title;
  getEl("viewer").innerHTML =
    '<div class="fallback-chapter" id="server-chapter-content" style="font-size:' +
    fontSizePct +
    '%">' +
    ch.html +
    "</div>";
  getEl("status-text").textContent =
    "Section " + (index + 1) + " of " + localZipChapters.length;
}

async function loadServerChapter(chapterIndex: number): Promise<void> {
  if (!isConnected) return;
  const res = await app.callServerTool({
    name: "epub_read_chapter",
    arguments: {
      ...(currentFilePath ? { filePath: currentFilePath } : {}),
      chapterIndex
    }
  });
  const sc = res.structuredContent as
    | {
        index: number;
        title: string;
        wordCount: number;
        html?: string;
        text?: string;
      }
    | undefined;
  if (!sc) return;

  bookLoaded = true;
  localZipChapters = [];
  currentChapterIndex = sc.index;
  currentChapterTitle = sc.title;
  getEl("chapter-label").textContent = sc.title;
  getEl("viewer").innerHTML =
    '<div class="fallback-chapter" id="server-chapter-content" style="font-size:' +
    fontSizePct +
    '%">' +
    (sc.html || "<pre>" + (sc.text || "") + "</pre>") +
    "</div>";
  getEl("status-text").textContent =
    "Chapter " +
    (sc.index + 1) +
    " of " +
    serverChapters.length +
    " (" +
    sc.wordCount +
    " words)";
}

async function openViaServerStreaming(filePathOrName?: string, initialChapter = 10): Promise<void> {
  if (!isConnected) return;
  getEl("status-text").textContent = "Loading EPUB chapters...";

  const res = await app.callServerTool({
    name: "epub_list_chapters",
    arguments: filePathOrName ? { filePath: filePathOrName } : {}
  });
  const sc = res.structuredContent as
    | { filePath?: string; title?: string; chapters?: ServerChapterSummary[] }
    | undefined;
  if (!sc || !Array.isArray(sc.chapters)) return;

  currentFilePath = sc.filePath || filePathOrName || currentFilePath;
  currentBookId = (currentFilePath || "book.epub").split("/").pop() || "book.epub";
  getEl("book-title").textContent = sc.title || currentBookId;
  serverChapters = sc.chapters;

  const tocList = getEl("toc-list");
  tocList.innerHTML = "";
  serverChapters.forEach((ch) => {
    const row = document.createElement("div");
    row.className = "toc-item";
    row.textContent = ch.index + ". " + ch.title;
    row.onclick = () => {
      void loadServerChapter(ch.index);
    };
    tocList.appendChild(row);
  });

  const targetChapter = initialChapter < serverChapters.length ? initialChapter : 0;
  await loadServerChapter(targetChapter);
  await refreshSavedHighlights();
}

async function handleIncomingPayload(payload: {
  file?: { name?: string; resourceUri?: string } | null;
  filePath?: string | null;
  chapterIndex?: number;
}): Promise<void> {
  if (!isConnected) {
    queuedPayload = payload;
    return;
  }
  const fileNameOrPath = payload.filePath || payload.file?.name || undefined;

  // 1. Prefer instant server-side @lingo-reader/epub-parser streaming for workspace .epub files of any size
  try {
    await openViaServerStreaming(fileNameOrPath, payload.chapterIndex ?? 10);
    if (bookLoaded) return;
  } catch {
    // Fallback to host resourceUri blob read below
  }

  // 2. Fallback: read base64 blob from host `file.resourceUri` and unpack directly with JSZip + DOMParser
  if (payload.file?.resourceUri) {
    currentBookId = payload.file.name || "book.epub";
    getEl("book-title").textContent = currentBookId;
    getEl("status-text").textContent = "Reading " + currentBookId + " from IDE host...";
    try {
      const blobRes = await app.readServerResource({ uri: payload.file.resourceUri });
      const item = blobRes.contents?.[0] as { blob?: string } | undefined;
      if (item?.blob) {
        const buf = base64ToArrayBuffer(item.blob);
        await openWithDirectJsZip(buf, currentBookId);
      }
    } catch (err) {
      getEl("status-text").textContent = "Failed to load file resource: " + String(err);
    }
  }
}

async function saveHighlight(
  color: "yellow" | "cyan" | "green",
  noteText = ""
): Promise<void> {
  if (!pendingSelection) return;
  const { text, cfiRange } = pendingSelection;
  getEl("selection-toolbar").classList.remove("visible");

  const entry: SavedHighlight = {
    bookId: currentBookId,
    cfiRange,
    text,
    note: noteText,
    color,
    chapterTitle: currentChapterTitle,
    chapterIndex: currentChapterIndex
  };
  highlights.push(entry);
  renderHighlightsList();

  if (isConnected) {
    try {
      await app.callServerTool({
        name: "epub_save_highlight",
        arguments: entry as unknown as Record<string, unknown>
      });
      getEl("status-text").textContent = "Saved " + color + " highlight";
    } catch {
      getEl("status-text").textContent = "Saved highlight in session";
    }
  }
}

async function quoteSelectionToChat(): Promise<void> {
  if (!pendingSelection) return;
  const { text, cfiRange } = pendingSelection;
  getEl("selection-toolbar").classList.remove("visible");

  const bookTitle = getEl("book-title").textContent || currentBookId;
  const formattedQuote =
    `> **[${bookTitle} — ${currentChapterTitle}]** ${cfiRange ? "(`" + cfiRange + "`)" : ""}\n` +
    `> "${text}"\n\n`;

  if (isConnected) {
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: formattedQuote }]
      });
      getEl("status-text").textContent = "Sent quote to Antigravity chat";
    } catch (err) {
      getEl("status-text").textContent = "Quote ready: " + String(err);
    }
  }
}

function wireDomControls(): void {
  getEl("btn-toc").onclick = () => {
    getEl("drawer-title").textContent = "Table of Contents";
    getEl("toc-drawer").classList.toggle("open");
  };
  getEl("btn-highlights").onclick = () => {
    getEl("highlights-drawer").classList.toggle("open");
  };
  getEl("btn-prev").onclick = () => {
    if (localZipChapters.length > 0 && currentChapterIndex > 0) {
      renderLocalZipChapter(currentChapterIndex - 1);
    } else if (currentChapterIndex > 0) {
      void loadServerChapter(currentChapterIndex - 1);
    }
  };
  getEl("btn-next").onclick = () => {
    if (localZipChapters.length > 0 && currentChapterIndex + 1 < localZipChapters.length) {
      renderLocalZipChapter(currentChapterIndex + 1);
    } else if (currentChapterIndex + 1 < serverChapters.length) {
      void loadServerChapter(currentChapterIndex + 1);
    }
  };
  getEl("btn-flow").onclick = () => {
    getEl("toc-drawer").classList.toggle("open");
  };
  getEl("btn-font-dec").onclick = () => {
    fontSizePct = Math.max(70, fontSizePct - 10);
    const scEl = document.getElementById("server-chapter-content");
    if (scEl) scEl.style.fontSize = fontSizePct + "%";
  };
  getEl("btn-font-inc").onclick = () => {
    fontSizePct = Math.min(180, fontSizePct + 10);
    const scEl = document.getElementById("server-chapter-content");
    if (scEl) scEl.style.fontSize = fontSizePct + "%";
  };

  document.querySelectorAll(".swatch").forEach((el) => {
    (el as HTMLElement).onclick = () => {
      const color = (el.getAttribute("data-color") || "yellow") as
        | "yellow"
        | "cyan"
        | "green";
      void saveHighlight(color);
    };
  });

  getEl("btn-add-note").onclick = () => {
    const note = window.prompt("Add study note for this highlight:", "");
    if (note !== null) {
      void saveHighlight("yellow", note);
    }
  };

  getEl("btn-quote-chat").onclick = () => {
    void quoteSelectionToChat();
  };

  getEl("btn-export-md").onclick = async () => {
    if (!isConnected) return;
    try {
      const res = await app.callServerTool({
        name: "epub_export_highlights_markdown",
        arguments: { bookId: currentBookId }
      });
      const sc = res.structuredContent as { markdown?: string } | undefined;
      if (sc?.markdown) {
        await app.sendMessage({
          role: "user",
          content: [{ type: "text", text: "Here are my exported book highlights:\n\n" + sc.markdown }]
        });
        getEl("status-text").textContent = "Exported highlights to chat";
      }
    } catch {
      // ignore
    }
  };

  getEl("btn-search").onclick = async () => {
    const q = getEl<HTMLInputElement>("search-input").value.trim();
    if (!q || !isConnected) return;
    getEl("toc-drawer").classList.add("open");
    getEl("drawer-title").textContent = 'Search: "' + q + '"';
    const tocList = getEl("toc-list");
    tocList.innerHTML = "<div class='toc-item'>Searching...</div>";

    try {
      const res = await app.callServerTool({
        name: "epub_search",
        arguments: {
          ...(currentFilePath ? { filePath: currentFilePath } : {}),
          query: q
        }
      });
      const sc = res.structuredContent as
        | { matches?: Array<{ chapterIndex: number; chapterTitle: string; excerpt: string }> }
        | undefined;
      const matches = sc?.matches || [];
      tocList.innerHTML = "";
      if (!matches.length) {
        tocList.innerHTML = "<div class='toc-item'>No matches found.</div>";
        return;
      }
      matches.forEach((m) => {
        const item = document.createElement("div");
        item.className = "toc-item";
        item.innerHTML =
          "<strong>" +
          m.chapterTitle +
          "</strong><br/><span>" +
          m.excerpt.slice(0, 120) +
          "...</span>";
        item.onclick = () => {
          void loadServerChapter(m.chapterIndex);
        };
        tocList.appendChild(item);
      });
    } catch {
      // ignore
    }
  };

  getEl<HTMLInputElement>("file-picker").addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result instanceof ArrayBuffer) {
        void openWithDirectJsZip(ev.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  document.addEventListener("mouseup", () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text && text.length > 2) {
      pendingSelection = {
        text,
        cfiRange: "chapter-" + currentChapterIndex
      };
      getEl("selection-toolbar").classList.add("visible");
    }
  });
}

// Register official MCP Apps notifications BEFORE app.connect()
app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
};

app.ontoolinput = (params) => {
  const args = (params.arguments || {}) as {
    file?: { name?: string; resourceUri?: string };
    filePath?: string;
    chapterIndex?: number;
  };
  void handleIncomingPayload(args);
};

app.ontoolresult = (params) => {
  const sc = (params.structuredContent || {}) as {
    file?: { name?: string; resourceUri?: string } | null;
    filePath?: string | null;
    chapterIndex?: number;
  };
  if (!bookLoaded) {
    void handleIncomingPayload(sc);
  }
};

async function init(): Promise<void> {
  wireDomControls();
  try {
    await app.connect();
    isConnected = true;
    const hostCtx = app.getHostContext();
    if (hostCtx?.theme) {
      applyDocumentTheme(hostCtx.theme);
    }
    if (hostCtx?.styles?.variables) {
      applyHostStyleVariables(hostCtx.styles.variables);
    }
    if (queuedPayload) {
      const p = queuedPayload;
      queuedPayload = null;
      await handleIncomingPayload(p);
    }
    setTimeout(() => {
      if (!bookLoaded && isConnected) {
        void openViaServerStreaming(undefined, 10);
      }
    }, 200);
  } catch {
    try {
      const f =
        (window as unknown as { sidecar?: { fetch?: typeof fetch } }).sidecar?.fetch?.bind(
          (window as unknown as { sidecar?: unknown }).sidecar
        ) || fetch;
      const res = await f("/api/book", { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as { name?: string; blob?: string };
        if (data?.blob) {
          const buf = base64ToArrayBuffer(data.blob);
          await openWithDirectJsZip(buf, data.name || "book.epub");
          return;
        }
      }
    } catch {
      // ignore if not running in sidecar mode
    }
    getEl("status-text").textContent = "Standalone mode — use 📂 Open .epub above";
  }
}

void init();
