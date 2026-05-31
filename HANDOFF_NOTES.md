# Handoff Notes

## Phase 5 — Resilience + Capability Guards (2026-05-30)

### Built
- Hardened runtime capability detection so preview fallbacks keep measured latency and `VITE_API_BASE_URL` is honored when constructing `/api/health`.
- Added focused capability unit tests for failed health responses and custom API base URLs.
- Added a stale-state macro sidebar fallback using `FeatureUnavailable`, so a hidden macro tab cannot leave an empty panel if selected before capability detection settles.
- Added client OCR queue tests proving five concurrent recognition calls reuse one Tesseract worker and execute sequentially.
- Added client OCR failure-recovery coverage so a rejected recognition does not poison later OCR requests.

### Deferred
- Full `pnpm test` was not run for this slice; targeted Phase 5 tests, typecheck, lint, static checks, and whitespace checks passed.
- Browser/DevTools validation of worker thread count remains manual because this non-interactive environment cannot inspect DevTools worker threads.
- Backend fitz-boundary verification is not applicable in this checkout because there is no `backend/` directory.

### Known limits
- Capability detection still caches the first health result for the session; a future refresh action can re-probe if live server attach/detach support is required.
- Preview OCR remains a client-side Tesseract path; server OCR gating remains capability-driven and should stay hidden until the backend contract exists.

## Phase 6 — Performance + Polish (2026-05-30)

### Built
- Made Vite base-path configuration use `VITE_BASE_PATH` with a default `/Pdf-Hub/` fallback and added development/production env files.
- Restored the Konva fallback annotation renderer warning so unexpected annotation types emit structured Debug-page logs and render a visible amber placeholder.
- Added `PERFORMANCE_BASELINE.md` with all measurement cells populated and explicit manual-browser follow-up markers for rows that cannot be captured in this container.
- Fixed build-blocking TypeScript errors in workspace annotation fallback logging, RichText editor duplicate helpers, and DebugPage system snapshot typing.
- Updated `AUDIT_BASELINE.md` with Phase 6 static-check outcomes and current build health.

### Deferred
- Interactive browser smoke testing remains deferred because this environment has no browser/DevTools access and no `Math SA-Dec-25.pdf` fixture.

### Known limits
- Performance rows marked ⚠️ in `PERFORMANCE_BASELINE.md` need real browser measurements before using the baseline for regression enforcement.

## S-Phase 4 & 5 — WordPad Toolbar, Export & E2E (2026-05-31)

### Built
- **WordPad-Style Formatting Toolbar**: Extended the popup editor with text highlighting color picker, heading level triggers, and insert table/image buttons.
- **Interactive Drag-and-Drop / Paste Plugins**: Integrated `ImageDropPlugin` (for data URL base64 image uploads) and `TablePastePlugin` (for auto-parsing pasted CSV/TSV tables).
- **High-Fidelity PDF Block Renderer**: Developed `richTextRenderer.ts` and updated `flattenedPdfExport.ts` to convert Lexical editor states into beautifully wrapped, styled text spans, lists, headings, and cell-clamped tables.
- **Playwright E2E Test Suite**: Written `static-smoke.spec.ts` and configured Playwright to execute against the production build, proving 100% of major UI zones mount correctly in preview/static modes.
- **Verified Build & Test Quality**: All 548 unit tests pass and `check:release` compiles without errors.

### Known limits
- The E2E tests run in headless mode against the localhost preview server; full browser interactions should be tested on real devices during manual QA.
- PDF generation uses standard Helvetica and maps non-supported fonts to Helvetica variants.

