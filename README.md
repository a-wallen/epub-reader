# EPUB Reader for Google Antigravity

Native `.epub` custom file viewer and study companion for **Google Antigravity** (`v2.34.0+`), built on the **MCP Apps** (`io.modelcontextprotocol/ui` & `com.google.antigravity/ui`) extension standard and **`epub.js`**.

<a href="antigravity://customizations/marketplaces/antigravity-plugins-partners/plugins/epub-reader">Open in Antigravity</a>

---

## Features

- **Automatic `.epub` Side Panel Viewer (`file` Entrypoint)**: Click any `.epub` file in your project file tree or command palette (`Cmd/Ctrl + P`) to open it directly in the Side Panel next to your conversation.
- **Offline Single-File `ui://` Bundle**: Packages `epub.js` + `jszip` directly inside `ui://epub-reader/viewer.html` so books render 100% locally under Antigravity's strict default-deny Content Security Policy (`CSP`).
- **Persistent Color Highlights & Reading Progress**: Select any passage to highlight it (Yellow, Cyan, or Green) using standard EPUB Canonical Fragment Identifiers (`epubcfi`). Highlights and bookmarks persist automatically via the bundled local `stdio` MCP server (`${PLUGIN_DATA}`).
- **1-Click "Quote to Chat" (`ui/message`)**: Select a paragraph in the reader and send the exact quote + chapter context directly into your active Antigravity conversation.
- **Agent-Side EPUB Search & Chapter Tools**: Gives the Antigravity agent direct tools (`epub_list_chapters`, `epub_read_chapter`, `epub_search`, `epub_list_highlights`, `epub_export_highlights_markdown`) to search and read chapters of any size—even illustrated technical books over the `10 MiB` iframe bridge limit.

---

## Installation

### From the Antigravity CLI
```bash
# Install from a local clone
agy plugin install ./epub-reader

# Validate manifest and components
agy plugin validate --strict ./epub-reader
```

---

## Contributor & Dev Container Workflow

This repository is designed so that:
1. **Antigravity can clone and run it directly** with zero install-time build step (`scripts/mcp-server.mjs` and `scripts/viewer.html` are pre-bundled and committed).
2. **Contributors can develop and test inside a deterministic Dev Container** (`.devcontainer/`), which is also the exact container image executed by GitHub Actions CI.

```bash
# Install dev dependencies and rebuild scripts/ from src/
npm install
npm run build

# Run the automated MCP protocol & EPUB parser test suite
npm test

# Run strict Antigravity plugin validation
npm run validate
```

## License

MIT © a-wallen
