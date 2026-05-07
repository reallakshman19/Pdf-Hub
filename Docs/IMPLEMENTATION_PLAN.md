# DocCraft — Implementation Plan (v2)

> Changes from v1:
> - Mode renamed: "static" → "preview" throughout
> - Celery/Redis removed; asyncio BackgroundTasks used instead
> - Adapter creation deferred to Phase 2–3
> - Phase 6–8 removed; roadmap stops at Phase 5
> - OCR performance thresholds marked TBD (benchmark first)
> - EquationEditor (correction UI) added to Phase 4
> - Annotation persistence: IndexedDB (P3 preview), SQLite (P3 server)
> - Debug console moved to /debug route (Phase 0)
> - PreviewModeBanner added to Phase 0
> - File TTL cleanup added to Phase 2
> - OCR failure states + recovery added to Phase 4

\---

## Phase Overview

|Phase|Name|Sprint|Status|
|-|-|-|-|
|P0|Foundation + repo setup|1|⬜ Planned|
|P1|App shell + layout|1–2|⬜ Planned|
|P2|PDF rendering + viewer|2–3|⬜ Planned|
|P3|Annotations + persistence|3–4|⬜ Planned|
|P4|OCR + equation rendering|4–6|⬜ Planned|
|P5|Macro API + export|6–7|⬜ Planned|

\---

## Phase 0 — Foundation and Repo Setup

### Goal

Compilable project with shared contracts, mode detection, structured logging,
a `/debug` developer page, and an honest preview mode banner.
No PDF features. No visible product yet.

### Tasks

#### P0-T1: Repo and tooling

* \[ ] `pnpm` workspace: `frontend/`, `backend/`, `sdk/`, `tests/` packages
* \[ ] Root scripts: `test`, `lint`, `typecheck`, `benchmark`
* \[ ] Two LICENSE files: `LICENSE-frontend` (MIT), `LICENSE-backend` (AGPL-3.0)
* \[ ] Husky pre-commit: lint-staged
* \[ ] Vite + React + TypeScript, `strict: true`, path aliases (`@/`)
* \[ ] Tailwind — **light theme as default**, dark via `.dark` class
* \[ ] ESLint: `no-console: error`, `@typescript-eslint/no-explicit-any: error`
* \[ ] Vitest, coverage threshold 80% on core/ and adapters/

#### P0-T2: Core contracts (type shells only)

* \[ ] `core/capabilities/types.ts` — `AppCapabilities`, `AppMode = 'preview' | 'server'`
* \[ ] `core/session/types.ts` — `DocumentSession`, `ViewState`
* \[ ] `core/annotations/types.ts` — `PdfAnnotation`, `AnnotationType`, `Rect`
* \[ ] `core/ocr/types.ts` — `OcrJob`, `OcrResult`, `OcrPageResult`, `OcrStatus`

  * `OcrStatus` must include: `queued | running | complete | equation-failed | low-confidence | cancelled | timeout`
* \[ ] `core/editor/types.ts` — `EditorState`, `ActiveTool`
* \[ ] `core/logger/types.ts` — `AppLogEntry`, `LogLevel`, `LogSource`

#### P0-T3: Capabilities resolver

* \[ ] `core/capabilities/resolver.ts` — ping `/api/ping` with 1.5s timeout

  * success → `mode: 'server'`
  * failure → `mode: 'preview'`
* \[ ] `core/capabilities/useCapabilities.ts` — hook, called once on mount
* \[ ] Unit test: returns `preview` when fetch fails, `server` when ping succeeds

#### P0-T4: Logger

* \[ ] `core/logger/service.ts` — `log()`, `warn()`, `error()` with typed payload
* \[ ] `core/logger/store.ts` — Zustand ring buffer, max 500, writes to sessionStorage in dev
* \[ ] Emits on startup: `system/info/"App startup"` with mode, version, userAgent
* \[ ] Unit test: entries stored, ring truncates at 500

#### P0-T5: Preview mode banner

* \[ ] `components/preview-banner/PreviewModeBanner.tsx`
* \[ ] Renders in `WorkspacePage` when `mode === 'preview'`
* \[ ] Cannot be dismissed — no close button
* \[ ] Text: *"Running in preview mode — start the local server for full editing features."*
* \[ ] Amber background, icon, link to docs

#### P0-T6: Debug page

* \[ ] `pages/DebugPage.tsx` at route `/debug`
* \[ ] Four tabs: Logs | State | Performance | System
* \[ ] **Logs tab**: virtualized list of AppLogEntry, filterable by level + source,
color-coded by level, copy-to-clipboard per row
* \[ ] **State tab**: live JSON dump of all Zustand stores, refreshes every 1s
* \[ ] **System tab**: mode, browser, screen, memory, server version if connected
* \[ ] **Performance tab**: render times stub (filled in Phase 2)
* \[ ] Keyboard shortcut `Ctrl+Shift+D` navigates to `/debug`
* \[ ] In `VITE\_ENV=production` → redirect to `/`

#### P0-T7: Backend scaffold

* \[ ] FastAPI app in `backend/`
* \[ ] `config.py`: `host='127.0.0.1'`, `port=8000`, `max\_upload\_mb=100`, `tmp\_ttl\_hours=24`
* \[ ] `auth/apikey.py`: key generated on first start, written to `.env`, printed to console

  * localhost requests (127.0.0.1): key optional
  * non-localhost requests: key required
* \[ ] `GET /api/ping` → `{ status: "ok", mode: "server", version: "0.1.0" }`
* \[ ] `GET /api/capabilities` → `ServerCapabilities` Pydantic model
* \[ ] CORS: `http://localhost:3000` only
* \[ ] pytest + httpx + pytest-asyncio

#### P0-T8: Docker Compose

* \[ ] `docker-compose.yml`: `frontend`, `backend` services only (no Redis, no worker)
* \[ ] `docker-compose.dev.yml`: volume mounts for hot reload
* \[ ] Verify `docker-compose up --build` reaches healthy state

### Acceptance Criteria

```
✓ pnpm build — zero errors
✓ pnpm typecheck — zero TypeScript errors
✓ pnpm lint — zero ESLint errors (no console.log, no any)
✓ GET /api/ping returns 200 { status: "ok" }
✓ Resolver returns mode:'preview' when no server
✓ Resolver returns mode:'server' when server running
✓ PreviewModeBanner visible when mode=preview; absent when mode=server
✓ /debug route renders 4 tabs
✓ logStore has ≥ 2 entries on startup
✓ Ctrl+Shift+D navigates to /debug (not toggles a dock)
✓ Two LICENSE files present with correct content
✓ grep -rn "import fitz" backend/app/ → empty (pdf\_engine/ not yet needed)
✓ Unit tests pass, coverage ≥ 80% on core/capabilities + core/logger
```

\---

## Phase 1 — App Shell and Layout

### Goal

Complete workspace shell — all zones rendered, resizable, keyboard-navigable,
with placeholder content. Light theme default. No PDF loading yet.

### Tasks

#### P1-T1: Design system

* \[ ] `components/ui/` — Button, Badge, Tooltip, Tabs, Modal, Separator, FeaturePlaceholder
* \[ ] `styles/themes.css` — light-first CSS variables, `.dark` class for dark mode
* \[ ] `useDarkMode.ts` — toggle, persists to localStorage, respects `prefers-color-scheme`
* \[ ] Typography: IBM Plex Sans (UI), IBM Plex Mono (code/debug)

#### P1-T2: AppShell

* \[ ] Grid layout: topnav / toolbar / \[rail | sidebar | workspace | inspector] / statusbar
* \[ ] Three-column main area with resizable splitters (CSS resize or custom drag)
* \[ ] Sidebar and inspector collapsible (animated, persist widths to localStorage)
* \[ ] **No debug dock.** No debug toggle anywhere in shell.

#### P1-T3: TopNav

* \[ ] Logo, mode badge (PREVIEW amber / SERVER green)
* \[ ] Nav items: Workspace | Macro Console (server mode only, capability-gated)
* \[ ] Search placeholder
* \[ ] Settings button (stub), theme toggle
* \[ ] **No debug toggle button**

#### P1-T4: Toolbar band — 5 groups with placeholder buttons

* \[ ] File: Open, Save, Export, Download
* \[ ] Organize: Merge, Split, Insert, Delete, Rotate
* \[ ] Comment: TextBox, Highlight, Underline, Stamp, Shape, Draw, Note
* \[ ] OCR: Run OCR (preview, always shown), Server OCR (server mode only)
* \[ ] View: Zoom−, level label, Zoom+, Fit Width, Fit Page, Actual Size
* \[ ] Server-only buttons hidden (not disabled) in preview mode

#### P1-T5: Left rail — 5 items

* \[ ] Pages, Bookmarks, Comments, Search, OCR Jobs
* \[ ] Click → changes active sidebar tab
* \[ ] Active indicator

#### P1-T6: Sidebar panel — 5 tabs with FeaturePlaceholder

* \[ ] Thumbnails (P2), Bookmarks (P2), Comments (P3), Search (P2), OCR Jobs (P4)

#### P1-T7: Document workspace

* \[ ] Empty state: logo, "Open a PDF to begin", drop zone visual
* \[ ] Scroll container for virtual page list

#### P1-T8: Inspector panel — 3 tabs with FeaturePlaceholder

* \[ ] Properties (P3), Style (P3), Metadata (P2)

#### P1-T9: Status bar

* \[ ] Page: `— / —`, Zoom: `100%`, mode badge, save indicator placeholder

#### P1-T10: Editor state store

* \[ ] `core/editor/store.ts`: activeTool, sidebarTab, inspectorTab, panelWidths





REFERENCE: landing page:doccraft\_ui\_mockup.html and SPEC:UI\_DESIGN\_SPEC.md

```


* 

### Acceptance Criteria

```
✓ All 7 shell zones render (no debug dock zone)
✓ PreviewModeBanner visible in preview mode across all zones
✓ Left rail → sidebar tab change works
✓ Sidebar + inspector collapse/expand with animation
✓ Panel widths persist across refresh
✓ /debug still accessible via Ctrl+Shift+D (navigates, not toggles)
✓ Mode badge correct in TopNav and StatusBar
✓ Server-only buttons absent in preview mode
✓ Light theme default; dark mode toggle works
✓ No overflow at 1024×768
✓ Playwright p1-layout.spec.ts — all tests green
```

\---

## Phase 2 — PDF Rendering and Viewer

### Goal

Fully functional PDF viewer: open file, render pages, navigate, zoom, select text.
File adapter, adapter extraction begins. Temp file lifecycle in backend.

### Tasks

#### P2-T1: Benchmark first

* \[ ] Run `tests/benchmark/render\_benchmark.py` on target hardware
* \[ ] Record baseline: first-page render time for 1 MB, 10 MB, 50 MB files
* \[ ] Fill in performance thresholds in VERIFICATION\_SYSTEM.md §3 Phase 2

#### P2-T2: FileAdapter (first adapter)

* \[ ] `adapters/file/FileAdapter.ts`
* \[ ] `openFromInput(file: File): Promise<ArrayBuffer>` — validates type + size
* \[ ] `downloadFile(buffer, name): void`
* \[ ] Logs: file name, size, open time

#### P2-T3: PdfRendererAdapter (second adapter)

* \[ ] `adapters/pdf-renderer/PdfRendererAdapter.ts`
* \[ ] `loadDocument(buffer): Promise<PdfDocument>`
* \[ ] `renderPage(page, scale, canvas): Promise<RenderedPage>`
* \[ ] `getTextContent(page): Promise<TextBlock\[]>`
* \[ ] `getThumbnail(page): Promise<string>` (150px wide dataURL)
* \[ ] Logs render time per page
* \[ ] Unit tests with `simple-text.pdf`

#### P2-T4: Session store

* \[ ] `core/session/store.ts`: currentFile, pageCount, currentPage, zoom, isDirty
* \[ ] Actions: openDocument, setPage, setZoom

#### P2-T5: PdfViewer + PageCanvas + TextLayer

* \[ ] Virtual list — only renders visible pages ± 1
* \[ ] Intersection Observer for lazy render
* \[ ] TextLayer: absolute-positioned spans, enables text selection + Ctrl+F
* \[ ] Keyboard navigation: arrows, Page Up/Down, Home/End

#### P2-T6: Zoom controls

* \[ ] Preset zoom steps: 25, 50, 75, 100, 125, 150, 200, 300, 400%
* \[ ] Fit to width, fit to page, actual size
* \[ ] Zoom slider in status bar
* \[ ] Keyboard: Ctrl+, Ctrl-

#### P2-T7: Thumbnail + Bookmarks + Search panels (real behavior)

#### P2-T8: Backend file API

* \[ ] `POST /api/files/upload` → `{ fileId, pageCount, metadata }`

  * 100 MB limit enforced
  * File stored as `storage/tmp/{uuid}/{original\_name}`
* \[ ] `GET /api/files/{id}/pages/{n}` → PNG stream
* \[ ] `pdf\_engine/reader.py`: `open\_document`, `get\_page\_image`, `get\_text\_blocks`
* \[ ] `storage/file\_store.py`:

  * `save\_file(file: UploadFile) → str (uuid)`
  * `get\_path(uuid: str) → Path`
  * `cleanup\_expired(ttl\_hours: int)` — called on startup

#### P2-T9: MetadataTab in inspector (real behavior)

### Acceptance Criteria

```
✓ Benchmarks recorded in VERIFICATION\_SYSTEM.md before writing thresholds
✓ simple-text.pdf renders all pages within measured benchmark target
✓ Text is selectable via mouse drag
✓ Zoom 25%–400% works
✓ Thumbnail panel: click navigates
✓ Keyboard navigation works
✓ Memory: only visible ± 1 pages rendered at once
✓ Storage cleanup runs on server startup; files > TTL removed
✓ grep -rn "import fitz" backend/app/ backend/services/ → empty
✓ Playwright p2-viewer.spec.ts — all tests green
```

\---

## Phase 3 — Annotations and Persistence

### Goal

Full annotation toolkit with undo/redo. Annotations persist correctly:
IndexedDB in preview mode, SQLite in server mode.

### Tasks

#### P3-T1: FabricAdapter (third adapter)

* \[ ] `adapters/annotation-canvas/FabricAdapter.ts`
* \[ ] `initCanvas(el)`, `addObject(annotation)`, `removeObject(id)`,
`serialize() → PdfAnnotation\[]`, `deserialize(annotations)`
* \[ ] Events: `onSelectionChange`, `onObjectModified`
* \[ ] `serializer.ts`: bidirectional Fabric ↔ PdfAnnotation (no Fabric types leak out)

#### P3-T2: AnnotationOverlay

* \[ ] Fabric canvas at z-index above TextLayer
* \[ ] Resizes with page viewport on zoom change

#### P3-T3: Annotation tools

* \[ ] TextBox, Highlight, Underline, Shape, Freehand, Stamp, Comment pin

#### P3-T4: Annotation store + persistence

* \[ ] `core/annotations/store.ts`: CRUD + undo/redo stack (50 operations)
* \[ ] `core/annotations/persistence.ts`:

  * Preview mode: read/write IndexedDB via `idb` library, key = SHA-256 of first 64 KB of file
  * Server mode: REST calls to `/api/annotations`
  * Interface is the same either way — `saveAnnotations()`, `loadAnnotations()`

#### P3-T5: Backend annotation API

* \[ ] `storage/annotation\_db.py`: aiosqlite — table `annotations(id, file\_id, page, type, data\_json)`
* \[ ] CRUD endpoints in `api/annotations.py`

#### P3-T6: Inspector (real behavior) + Comments panel

#### P3-T7: EquationEditor stub

* \[ ] `components/ocr/EquationEditor.tsx` — accepts `latex: string`, `onSave(corrected: string)`
* \[ ] Not yet wired to OCR; used in Phase 4

### Acceptance Criteria

```
✓ 7 annotation types create and render
✓ Undo/redo 50 steps without corruption
✓ Preview mode: annotations in IndexedDB after page refresh (not localStorage)
✓ Server mode: annotations in SQLite, visible across browser sessions
✓ Inspector shows correct properties per annotation type
✓ Annotations survive zoom change without repositioning
✓ Comments panel click → navigate to page + highlight
✓ Playwright p3-annotations.spec.ts — all tests green
```

\---

## Phase 4 — OCR Pipeline and Equation Rendering

### Goal

Full OCR pipeline. Equations render as MathJax SVG. Every equation has a
correction UI. Failure states handled gracefully. No Celery — asyncio tasks only.

### Tasks

#### P4-T1: Benchmark first

* \[ ] Run `tests/benchmark/ocr\_benchmark.py` on target hardware
* \[ ] Test files: `simple-text.pdf`, `equations-sample.pdf`, `scanned-sample.pdf`
* \[ ] Record: sec/page for text-only, sec/page for equations, accuracy samples
* \[ ] Fill in thresholds in VERIFICATION\_SYSTEM.md §3 Phase 4

#### P4-T2: TesseractAdapter (preview mode)

* \[ ] Web Worker initialization
* \[ ] `runOcr(imageData, options) → Promise<OcrResult>`
* \[ ] Progress callback per page
* \[ ] English only by default

#### P4-T3: OcrApiAdapter (server mode)

* \[ ] `POST /api/ocr/start` → `{ jobId }`
* \[ ] `WebSocket /ws/ocr/{jobId}` → progress events
* \[ ] `GET /api/ocr/{jobId}/result` → `OcrResult`
* \[ ] Reconnect logic: on WS drop, reconnect and request current progress

#### P4-T4: Backend OCR service + asyncio task

* \[ ] `pdf\_engine/region\_classifier.py`: classifies page regions as text/image/equation
* \[ ] `services/ocr\_service.py`:

  * Extract native text via pdf\_engine first
  * Rasterize only unextractable regions
  * Route equation regions to pix2tex
  * Return `OcrPageResult` with `status` field
* \[ ] `tasks/ocr\_task.py`:

  * asyncio `BackgroundTasks` — no Celery
  * Process 10-page batches
  * Checkpoint after each batch to `storage/job\_store.py`
  * Send per-page WS progress
  * Timeout at 30 minutes → set job status to `timeout`
  * On server restart: resume incomplete jobs from checkpoint

#### P4-T5: Failure handling (required, not optional)

* \[ ] pix2tex exception → page status `equation-failed`; save raw image region
* \[ ] Tesseract confidence < 0.3 on > 50% blocks → status `low-confidence`
* \[ ] WS drop → client reconnects with job ID; server resumes progress from last page
* \[ ] Job > 30 min → `timeout`; partial results saved

#### P4-T6: MathJaxAdapter

* \[ ] `renderLatex(latex, container) → Promise<void>`
* \[ ] `renderAll(equations) → Promise<void>`
* \[ ] Error fallback: failed render shows raw LaTeX in monospace

#### P4-T7: EquationOverlay + EquationEditor

* \[ ] `EquationOverlay.tsx`:

  * Renders MathJax SVG for `status: 'complete'` equations
  * Renders raw image + empty EquationEditor for `status: 'equation-failed'`
  * Every rendered equation has an edit ✏ button → opens EquationEditor
  * Toggle: MathJax view ↔ original scan image
* \[ ] `EquationEditor.tsx` (wired to OCR):

  * Shows current LaTeX string
  * Re-renders preview live as user types
  * Save → updates OcrPageResult + re-renders overlay
  * Logs: `ocr/info/"Equation correction"` with original + corrected

#### P4-T8: OCR jobs panel, search integration

### Acceptance Criteria

```
✓ Benchmarks recorded before thresholds set
✓ OCR starts and fires progress events without blocking UI
✓ complete equation: renders as <svg> via MathJax
✓ equation-failed: shows raw image + empty EquationEditor
✓ Every equation has edit button; correction re-renders correctly
✓ low-confidence page: yellow warning banner shown
✓ WS disconnect + reconnect: progress resumes
✓ Server restart during OCR: job resumes from checkpoint
✓ Ctrl+F searches OCR text output
✓ grep -rn "import fitz" backend/app/ backend/services/ → empty
✓ Playwright p4-ocr.spec.ts — all tests green
```

\---

## Phase 5 — Macro API and Export

### Goal

Programmatic PDF operations via REST and Python SDK. Annotation flattening export.
Macro Console page (server mode only).

### Tasks

#### P5-T1: pdf\_engine layer for macro

* \[ ] `pdf\_engine/header\_footer.py`: add text to every page at configured position
* \[ ] `pdf\_engine/inserter.py`: insert image/text/ReportLab table at x,y coordinates
* \[ ] `pdf\_engine/writer.py` (extend): merge list, split by ranges

#### P5-T2: Macro API endpoints

* \[ ] `POST /api/macro/header-footer`
* \[ ] `POST /api/macro/insert` (image, text, table at coordinates)
* \[ ] `POST /api/macro/merge`
* \[ ] `POST /api/macro/split`
* \[ ] `POST /api/macro/ocr` (batch)
* \[ ] `GET  /api/macro/job/{id}` (status)
* \[ ] `GET  /api/macro/job/{id}/download`
* \[ ] All run as asyncio BackgroundTasks — non-blocking

#### P5-T3: Macro Console page

* \[ ] `pages/MacroConsolePage.tsx` — server mode only (capability-gated)
* \[ ] JSON operation builder, job status list, download result

#### P5-T4: Export service

* \[ ] `services/export\_service.py`: flatten Fabric annotations into PDF via pdf\_engine
* \[ ] Options: with/without annotations, with/without OCR text layer
* \[ ] Frontend: Export button triggers export + download

#### P5-T5: Python SDK

* \[ ] `PDFClient` with chainable operations
* \[ ] `job.run()` with asyncio progress callback + sync blocking option
* \[ ] Full type annotations, MIT license

### Acceptance Criteria

```
✓ Merge part-a.pdf (5p) + part-b.pdf (7p) → output has 12 pages
✓ Header appears on all pages of output
✓ Insert image: position within 2px of spec
✓ SDK job.run() fires ≥ 3 progress events
✓ Export: text box annotation visible when exported PDF opened externally
✓ Macro Console page hidden in preview mode (DOM count = 0)
✓ grep -rn "import fitz" backend/app/ backend/services/ backend/tasks/ → empty
✓ Playwright p5-macro.spec.ts — all tests green
```

\---

## Ideas Backlog (not planned, not estimated)

These are recorded so they are not lost. They will not be designed or estimated
until Phase 5 is complete and real usage has been observed.

* AcroForm field detection and fill
* Digital signature (draw/type/upload)
* Permanent redaction
* Side-by-side PDF comparison
* Collaborative real-time annotations (Yjs)
* Cloud storage connectors (Google Drive, Dropbox)
* Plugin/extension system
* Multi-language OCR (beyond English)
* PDF/A compliance export

