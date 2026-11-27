import {
  EXTENSION_ID,
  RESOURCE_URI_META_KEY,
  type McpUiAppToolConfig
} from "@modelcontextprotocol/ext-apps/server";

/**
 * Host & IDE UI Adapter (`src/adapters/host-adapter.ts`)
 *
 * Translates IDE-specific MCP Apps metadata across all supported host namespaces:
 * - Standard MCP Apps (`ui.resourceUri` & `"ui/resourceUri"`)
 * - Google Antigravity (`"com.google.antigravity/ui"`)
 * - OpenAI / OpenClaw MCP App Extensions (`"openai/ui"`)
 */

export const VIEWER_RESOURCE_URI = "ui://epub-reader/viewer.html";

export function getHostUiCapabilities(): Record<string, object> {
  return {
    [EXTENSION_ID]: {},
    "com.google.antigravity/ui": {
      entrypoints: ["file", "aux_pane", "global"]
    },
    "openai/ui": {
      entrypoints: ["file", "global", "thread"]
    }
  };
}

export function getFileViewerToolMeta(
  extensions: string[] = [".epub"]
): McpUiAppToolConfig["_meta"] {
  return {
    ui: {
      resourceUri: VIEWER_RESOURCE_URI,
      visibility: ["model", "app"]
    },
    [RESOURCE_URI_META_KEY]: VIEWER_RESOURCE_URI,
    "com.google.antigravity/ui": {
      entrypoints: [
        {
          type: "file",
          title: "EPUB Reader",
          extensions
        }
      ]
    },
    "openai/ui": {
      entrypoints: [
        {
          type: "file",
          extensions
        }
      ]
    }
  };
}

export function getSidePanelToolMeta(title = "EPUB Reader"): McpUiAppToolConfig["_meta"] {
  return {
    ui: {
      resourceUri: VIEWER_RESOURCE_URI,
      visibility: ["model", "app"]
    },
    [RESOURCE_URI_META_KEY]: VIEWER_RESOURCE_URI,
    "com.google.antigravity/ui": {
      entrypoints: [
        {
          type: "aux_pane",
          title
        },
        {
          type: "global",
          title
        }
      ]
    },
    "openai/ui": {
      entrypoints: [
        {
          type: "global"
        },
        {
          type: "thread"
        }
      ]
    }
  };
}
