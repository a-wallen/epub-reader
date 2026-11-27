---
name: epub-reader
description: >-
  Read, search, and manage persistent highlights across local EPUB books in the
  workspace. Use when the user opens or references an .epub file, asks questions
  about chapters in an EPUB book, or wants to review, export, or synthesize
  their saved book highlights.
---

# EPUB Reader Skill

When the user asks about an `.epub` file or their reading highlights:

1. **Discover Structure**: Call `epub_list_chapters` with the path to the `.epub` file to inspect book metadata (title, author) and the numbered Table of Contents.
2. **Search or Read Chapters**:
   - Call `epub_search` to find specific terms, concepts, or quotes across the entire `.epub` archive.
   - Call `epub_read_chapter` to read the clean text of a specific chapter by index or `href`.
3. **Highlights & Study Notes**:
   - Call `epub_list_highlights` to inspect passages the user highlighted in the Side Panel EPUB Reader UI.
   - Call `epub_export_highlights_markdown` when the user wants a persisted Markdown study guide or checklist generated from their highlights.
