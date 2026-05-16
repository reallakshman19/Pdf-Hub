# Search Geometry + Navigation

- Implemented `useSearchStore` using zustand for search states and result handling
- Hooked `TopNav` search with debounce and `SearchPanel`
- Rewrote `PdfRendererAdapter.searchDocumentText` to compute correct `SearchHitRect` utilizing `getPageTextItems` with precise snippet extraction
- Placed hit count badges on `ThumbnailSidebar`
- Implemented robust `ActiveHitHighlight` in `DocumentWorkspace` to cleanly handle hit navigation and UI flashes.
- Addressed DOMMatrix missing issue for `vitest` in setup test.

Check scripts running successfully:
- \`corepack pnpm --filter frontend exec tsc --noEmit\`
- \`corepack pnpm --filter frontend lint\`
- \`corepack pnpm --filter frontend test -- search\`
