# DocCraft — AGENTS.md (v2)

> Changes from v1:
> - Adapter timing rule updated (extract in P2–3, not P0)
> - Debug console removed from shell invariants
> - PyMuPDF isolation rule added (pdf\_engine/ boundary)
> - Celery/Redis references removed
> - Preview mode banner rule added
> - Annotation persistence rule added
> - Equation correction workflow rule added

\---

## 0\. Read this first

This document governs every coding agent and every developer working on DocCraft.
It does not change mid-phase. When this file conflicts with a task description,
this file wins.

\---

## 1\. Architectural Invariants

### INV-1 — One UI shell, one entry point

```
RULE:  One React application. One createRoot call.
TEST:  grep -r "createRoot" frontend/src | wc -l  →  must equal 1
```

### INV-2 — PyMuPDF stays in pdf\_engine/

```
RULE:  Only files inside backend/pdf\_engine/ may import fitz.
TEST:  grep -rn "import fitz" backend/app/      →  must be empty
       grep -rn "import fitz" backend/services/ →  must be empty
       grep -rn "import fitz" backend/tasks/    →  must be empty
```

This is the license boundary. PyMuPDF is AGPL-3.0. Keeping its calls contained
makes a future extraction tractable. Nothing in app/, services/, or tasks/
touches fitz directly — they call pdf\_engine functions that return plain types.

### INV-3 — Adapters are extracted in Phase 2–3, not Phase 0

```
RULE:  Phase 0–1 may import PDF.js, Konva.js, Tesseract.js directly in
       components. Adapters are introduced when the coupling pain is visible —
       no earlier than Phase 2, no later than Phase 3.
NOTE:  The adapter direction is correct; the timing was wrong in v1.
```

By Phase 3, these adapters must exist:

* `adapters/pdf-renderer/PdfRendererAdapter.ts`
* `adapters/annotation-canvas/KonvaAdapter.ts`

### INV-4 — Domain types are pure TypeScript

```
RULE:  Types in core/\*/types.ts must not reference library types.
TEST:  core/annotations/types.ts must not import konva.\*
       core/ocr/types.ts must not import pdfjs-dist.\*
```

`PdfAnnotation` holds `rect: Rect`, not `konvaNode: Konva.Node`.

### INV-5 — Capabilities drive feature visibility

```
RULE:  Features not available in the current mode are hidden (not rendered),
       not broken (not throwing errors).
TEST:  In preview mode, server-OCR button DOM count = 0.
       In preview mode, macro console nav item DOM count = 0.
```

Use `useCapabilities()` to gate. Never use `import.meta.env` to gate features.

### INV-6 — OCR is always async

```
RULE:  No OCR call blocks the main thread. Ever.
       Tesseract.js: always in a Web Worker.
       Server OCR: always WebSocket progress.
```

### INV-7 — Equations render as MathJax SVG

```
RULE:  Equation results render as <svg> via MathJax. Never as <img>.
       Failed equations show the raw LaTeX string in an editable input.
TEST:  EquationOverlay must contain <svg> children (or correction input).
       EquationOverlay must never contain <img> with a LaTeX-source src.
```

### INV-8 — Every equation has a correction entry point

```
RULE:  Every rendered equation block must show an edit button.
       Clicking it opens EquationEditor with the current LaTeX string,
       lets the user correct it, and re-renders via MathJax on save.
REASON: pix2tex accuracy is 60–85% on real documents. Silent wrong
        equations are worse than no equations.
```

### INV-9 — Preview mode always shows its banner

```
RULE:  When mode = 'preview', PreviewModeBanner renders at the top of the
       workspace. It cannot be dismissed. It says, clearly:
       "Running in preview mode. Start the local server for full features."
REASON: Preview mode is an honest fallback, not a full product.
        Users must always know which mode they are in.
```

### INV-10 — Annotation persistence is explicit

```
RULE:  Preview mode: annotations stored in IndexedDB, keyed by file content hash.
       Server mode:  annotations stored in SQLite via /api/annotations.
       No localStorage for annotation data.
REASON: localStorage fails above \~5 MB and is cleared by browser privacy
        settings. IndexedDB has no practical size limit.
```

### INV-11 — Structured logging, no console.log in source

```
RULE:  All significant side effects use log() from core/logger/service.ts.
       console.log is banned in source. ESLint rule: no-console (error).
TEST:  grep -rn "console.log" frontend/src/  →  must be empty
```

### INV-12 — Server listens on 127.0.0.1 by default

```
RULE:  FastAPI host defaults to "127.0.0.1" in config.py.
       Exposing to 0.0.0.0 requires explicit environment variable override.
       API key middleware is active from day one (generated on first start).
```

\---

## 2\. Coding Behavior Rules

### CB-1 — TypeScript strict mode

`strict: true`, `noImplicitAny: true`. No `any` in core/ or adapters/. Use
`unknown` and narrow. ESLint: `@typescript-eslint/no-explicit-any: error`.

### CB-2 — Zustand store shape

Every store exports: typed state interface, typed actions interface, `create()`
with combined type, a `use{Name}Store()` selector hook.

### CB-3 — Error boundaries on major zones

`DocumentWorkspace`, `SidebarPanel`, and `InspectorPanel` each wrap in an
`ErrorBoundary`. A crash in the viewer must not take down the whole page.

### CB-4 — No direct DOM manipulation from React

After Phase 3 adapters exist: components manage refs, call adapter methods.
Adapters call `canvas.getContext`, `Konva.Stage()`, `MathJax.typesetPromise`.
Components never call these directly.

### CB-5 — Backend: Pydantic everywhere

All FastAPI route handlers use Pydantic models for request and response.
No raw `dict` in route signatures.

### CB-6 — Backend: async all the way down

All route handlers are `async def`. All I/O uses `await`. No blocking calls
in route handlers — dispatch to `BackgroundTasks` or `asyncio.create\_task`.

### CB-7 — OCR checkpoints every 10 pages

```python
# tasks/ocr\_task.py
# After every 10-page batch, write checkpoint to storage/job\_store
# On server restart, incomplete jobs resume from last checkpoint
```

### CB-8 — Temp file cleanup on startup

```python
# storage/file\_store.py
async def cleanup\_expired\_files():
    """Called once on server startup. Removes files older than TTL."""
```

\---

## 3\. Separation of Concerns

```
PreviewModeBanner    reads capabilities; shows/hides itself; no other logic
AppShell             layout zones, panel sizing, keyboard shortcuts
TopNav               logo, mode badge, nav items — no debug toggle
DocumentWorkspace    canvas layer stacking; no PDF logic
PageCanvas           calls PdfRendererAdapter (Phase 2+)
AnnotationOverlay    calls KonvaAdapter (Phase 3+)
EquationOverlay      calls MathJaxAdapter + shows EquationEditor on failed eq.
─────────────────────────────────────────────────────────
pdf\_engine/          ALL fitz calls — reader, writer, inserter, classifier
services/            call pdf\_engine functions; never import fitz
tasks/               asyncio tasks; call services; write checkpoints
─────────────────────────────────────────────────────────
core/session         current document state
core/annotations     annotation CRUD + undo/redo
core/ocr             job tracking + per-page results (including failure states)
core/logger          ring buffer, max 500, sessionStorage in dev
```

\---

## 4\. OCR Guardrails

### OG-1 — Hybrid pipeline (region-first)

Before running OCR on any page:

1. `pdf\_engine/reader.py` extracts native text blocks (fast, perfect quality)
2. Only regions with no extractable text are rasterized for OCR
3. Regions classified as equations by `region\_classifier.py` go to pix2tex
4. Everything else goes to Tesseract

Never run OCR on text that PyMuPDF can extract directly.

### OG-2 — Equation classifier thresholds

A region is routed to pix2tex when any of these are true:

* pix2tex confidence score > 0.70, OR
* Region contains ≥ 2 math Unicode symbols (`∑ ∫ √ ∂ ∈ ≤ ≥ ≠ ±`), OR
* Region aspect ratio is between 2:1 and 8:1 AND contains superscript glyphs

### OG-3 — Failure states are first-class

`OcrStatus` type must include these values and the UI must handle all of them:

```typescript
type OcrStatus =
  | 'queued'
  | 'running'
  | 'complete'
  | 'equation-failed'    // pix2tex crashed or returned empty
  | 'low-confidence'     // Tesseract confidence < 0.3 on > 50% of blocks
  | 'cancelled'
  | 'timeout'            // job exceeded 30 min
```

`equation-failed` shows the raw image + an empty EquationEditor for manual entry.
`low-confidence` shows a yellow warning banner on the page; text is still shown.

### OG-4 — WebSocket reconnect

If the WebSocket drops during an OCR job, the client must reconnect with the
same job ID and resume progress display from the last known page. The server
holds job state in memory and does not lose progress on a client disconnect.

### OG-5 — Never overwrite source PDF with OCR output

OCR output is an overlay. Source PDF bytes are never modified by OCR.
Export is the only operation that merges OCR into the PDF.

### OG-6 — Server OCR: 10-page batches

For documents > 10 pages, dispatch separate asyncio tasks per 10-page batch.
Each batch checkpoints before starting the next. If the server restarts, it
picks up from the last checkpoint.

\---

## 5\. Debug Console Rules

The debug console is a developer tool, not a product feature.

* Lives at `/debug` route, not in the AppShell
* `Ctrl+Shift+D` navigates to `/debug` — does not toggle a dock
* AppShell has no debug-related elements: no toggle button, no dock zone
* In `VITE\_ENV=production`, `/debug` redirects to `/`
* Structured logs are still emitted and stored in logStore — always
* The `/debug` page reads from logStore and displays Logs | State | Perf | System

\---

## 6\. Required Log Events

|Event|Level|Source|Required data|
|-|-|-|-|
|App startup|info|system|mode, version, userAgent|
|Mode detection|info|capabilities|mode, serverAlive, latencyMs|
|File opened|info|session|fileName, fileSizeBytes, pageCount|
|Page rendered|debug|pdf-renderer|pageNumber, renderTimeMs|
|OCR started|info|ocr|jobId, pageCount, mode|
|OCR page complete|debug|ocr|jobId, pageNumber, status, timeMs|
|OCR job complete|info|ocr|jobId, totalPages, totalTimeMs|
|OCR failure|warn|ocr|jobId, pageNumber, status, reason|
|Equation correction|info|ocr|equationId, original, corrected|
|Annotation created|info|annotation|id, type, pageNumber|
|Annotation store flushed|debug|annotation|count, storageType, timeMs|
|Unhandled error|error|system|error, stack, componentStack|

\---

## 7\. Phase Handoff Protocol

Before handing off to the next phase:

1. `pnpm test` — all tests pass
2. `pnpm typecheck` — zero TypeScript errors
3. `pnpm lint` — zero ESLint errors
4. `grep -rn "import fitz" backend/app/ backend/services/ backend/tasks/` → empty
5. Update VERIFICATION\_SYSTEM.md phase checklist
6. Write `HANDOFF\_NOTES.md` entry: what was built, what was deferred, known limits

\---

## 8\. What Agents Must Not Do

|Forbidden|Rule violated|
|-|-|
|Create multiple React entry points|INV-1|
|Import fitz outside pdf\_engine/|INV-2|
|Create adapters in Phase 0 or 1|INV-3|
|Store Konva.Node in Zustand|INV-4|
|Gate features with import.meta.env|INV-5|
|Run Tesseract synchronously on main thread|INV-6|
|Render equations as <img> tags|INV-7|
|Omit edit button from equation overlay|INV-8|
|Remove or make dismissible the preview banner|INV-9|
|Store annotations in localStorage|INV-10|
|Use console.log in source|INV-11|
|Default server to 0.0.0.0|INV-12|
|Add debug toggle to AppShell or TopNav|§5|
|Invent OCR performance thresholds without benchmarking|ARCHITECTURE §6.2|
|Use Celery or Redis|Stack decision|
|Implement Phase 6+ features|Scope boundary|

\---

## 9\. Pre-Commit Checklist

```
□ fitz imports only in backend/pdf\_engine/?          (must be YES)
□ No createRoot calls added?                          (total must stay 1)
□ No adapter created before Phase 2?                  (Phase 0–1 only)
□ All new domain types free of library references? (e.g. no konva imports) (must be YES)
□ All OCR statuses including failure cases handled?   (must be YES)
□ Every equation block has an edit button?            (must be YES)
□ Preview mode banner visible and non-dismissible?    (must be YES)
□ No annotations stored in localStorage?              (must be YES)
□ No console.log in source?                           (must be YES)
□ pnpm test passes?                                   (must be YES)
```
