# AGENTS.md

EPUB Reader is a Google Antigravity plugin: a local stdio MCP server (EPUB tools and a highlights store) plus an
MCP Apps HTML viewer (`ui://epub-reader/viewer.html`). `README.md` covers features and installation.

## Commands

Scripts live in `package.json`. Node 20 or later is required; the dev container (`.devcontainer/`) uses Node 22.

```bash
npm ci            # dev-only deps: epubjs and jszip, which get inlined into the viewer
npm run build     # src/ -> scripts/mcp-server.mjs + scripts/viewer.html
npm test          # node --test against the *built* scripts/mcp-server.mjs
npm run validate  # manifest, skill, MCP config, and bundle checks
npm run package   # dist/epub-reader-v<version>.zip + .sha256
```

Run `npm run build` before `npm test`: the tests start the built server, not `src/`.

## Source and generated files

- Edit `src/server/*.mjs` and `src/ui/viewer.html`. Treat `scripts/mcp-server.mjs` and `scripts/viewer.html` as
  build output, and commit them with the source change. Antigravity runs the committed files with no install
  step.
- `scripts/build.mjs` bundles the server by stripping import lines with a regex, then prepending a fixed list of
  `node:` imports. Keep every import on one line. If you use a new `node:` module, add it to `headerImports` in
  `scripts/build.mjs`.
- The server has zero runtime npm dependencies. Use Node built-ins only.
- The viewer must work offline under the host's default-deny CSP. Inline every asset, and keep
  `scripts/viewer.html` under 10 MiB (`npm run validate` checks this).

## MCP and host contracts

- Stdout carries newline-delimited JSON-RPC. Write diagnostics to stderr only.
- `plugin.json` is validated against Antigravity's schema, which rejects unknown top-level keys.
- `mcp_config.json` uses Antigravity's `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` placeholders. Without `--data-dir`
  or `PLUGIN_DATA`, highlights go to `~/.gemini/plugin-data/epub-reader/highlights.json`.
- The `name:` in `skills/epub-reader/SKILL.md` must match its folder name.
- `_meta["com.google.antigravity/ui"]` entrypoints (`file`, `aux_pane`) are Antigravity-only. Other MCP clients
  ignore them.

## Git

Feature PRs target `main`.
