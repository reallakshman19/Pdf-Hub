# DocCraft — Architecture (v2)

> Revised after critical review.
> Key changes from v1: mode story simplified, Celery removed,
> PyMuPDF license resolved, adapter layer deferred, debug console
> moved out of shell, annotation persistence defined, roadmap cut to Phase 5.

---

## 1. What This Product Actually Is

DocCraft is a **server-first PDF editor** with OCR and equation support.
It runs as a local FastAPI server. The frontend is a React SPA that connects to it.

There are two modes, but they are not equal products:

| Mode            | What it is                                      | Who it serves                        |
|-----------------|-------------------------------------------------|--------------------------------------|
| **Server mode** | Full editor — OCR, annotations, macro API       | The real product. Always the target. |
| **Preview mode**| Read-only viewer + limited client-side OCR      | Fallback when server is not running. Honest about its limits. |

Preview mode is not marketed as a full alternative. It exists so the frontend
is not a blank page when opened without the server. It carries a persistent
banner: *"Running in preview mode — start the server for full features."*

---

## 2. License Decision

| Component       | Library      | License     | Decision                                      |
|-----------------|--------------|-------------|-----------------------------------------------|
| PDF engine      | PyMuPDF      | AGPL-3.0    | ✓ Use it. Backend published on GitHub (AGPL). |
| PDF manipulation (client) | pdf-lib | MIT    | ✓ Use it. Preview mode only.                  |
| OCR text        | pytesseract  | Apache 2.0  | ✓ No issue.                                   |
| OCR equations   | pix2tex      | MIT         | ✓ No issue.                                   |
| Task async      | asyncio (stdlib) | PSF     | ✓ Replaces Celery. No license concern.        |

**Backend repo**: public on GitHub, `LICENSE: AGPL-3.0`.
**Frontend repo**: public on GitHub, `LICENSE: MIT`.

The PyMuPDF calls are isolated in `backend/pdf_engine/` — a structural boundary,
not a running microservice. If the project ever goes commercial, extraction to
a separate process is a bounded refactor of that one folder.

---

## 3. Technology Stack

### 3.1 Frontend

| Layer             | Library          | Version | Reason                                           |
|-------------------|------------------|---------|--------------------------------------------------|
| Framework         | React            | 18.x    | —                                                |
| Build             | Vite             | 5.x     | Fast HMR, static export for preview mode         |
| Language          | TypeScript       | 5.x     | Strict mode                                      |
| State             | Zustand          | 4.x     | Simple, testable                                 |
| PDF rendering     | pdfjs-dist (Mozilla)   | 4.x | Apache 2.0, direct canvas access, actively maintained |
| PDF React wrapper | react-pdf (wojtekmaj)  | 10.x | MIT, onRenderSuccess fires every render, canvas ref exposed |
| PDF manipulation  | pdf-lib          | 1.x     | Preview mode only — merge/split in browser       |
| Annotation canvas | Konva.js     | 10.x   | MIT, 55 kB gzip, stable serialization, multi-layer canvas |
| React canvas      | react-konva  | 19.x   | Declarative <Stage><Layer>, React 18/19 native support    |
| Math rendering    | MathJax 3        | 3.x     | LaTeX → SVG overlays                             |
| OCR (preview)     | Tesseract.js  | 7.x   | Web Worker, v5 memory leak fixed in v6, v7 adds relaxedsimd WASM |
| Routing           | React Router     | 6.x     | —                                                |
| Styling           | Tailwind CSS     | 3.x     | Utility-first, light-first theme                 |
| UI primitives     | Radix UI         | latest  | Accessible, unstyled                             |
| Icons             | Lucide React     | latest  | —                                                |
| Persistence       | idb (IndexedDB)  | 7.x     | Annotation storage in preview mode               |
| Testing           | Vitest + RTL     | latest  | —                                                |
| E2E               | Playwright       | latest  | —                                                |

### 3.2 Backend

| Layer             | Library               | Version | Reason                                           |
|-------------------|-----------------------|---------|--------------------------------------------------|
| Framework         | FastAPI               | 0.111+  | Async, typed, OpenAPI docs                       |
| PDF engine        | PyMuPDF (fitz)        | 1.24+   | Best-in-class; isolated in pdf_engine/           |
| OCR text          | pytesseract + Tesseract 5 | latest | LSTM engine                                   |
| OCR equations | pix2tex  | 0.1.4 | pip install "pix2tex[api]" — correct install; LaTeX-OCR repo is the same codebase. Pin to 0.1.4. Maintenance low but last release Jan 2025. Upgrade path: surya (VikParuchuri) when stability is confirmed.            |
| Page rasterize    | pdf2image             | 1.17+   | PDF → PIL images                                 |
| PDF generation    | ReportLab             | 4.x     | Headers, footers, tables, text at coordinates    |
| Async workers     | asyncio + BackgroundTasks | stdlib | Replaces Celery. Add queue only if needed.   |
| Progress stream   | WebSocket (FastAPI)   | built-in| OCR progress to frontend                         |
| Annotation DB     | SQLite via aiosqlite  | —       | Per-document annotation storage                  |
| Temp file store   | Local filesystem      | —       | UUID-named, TTL-based cleanup (see §7)           |
| Containerization  | Docker Compose        | 3.x     | One-command start                                |

**Not in this stack:**
- ~~Celery~~ — asyncio handles the job queue at this scale
- ~~Redis~~ — removed with Celery
- ~~PostgreSQL~~ — SQLite is sufficient; migrate if multi-user need emerges

---

## 4. Module Boundaries

Modules are introduced *when the coupling pain is visible*, not upfront.
Phase 0–1 use direct imports. Adapters are extracted in Phase 2–3.

```
Phase 0–1:  Components → Libraries directly (acceptable)
Phase 2+:   Components → Adapters → Libraries (extract as coupling becomes clear)
```

This is the only change from v1's adapter rule. The direction is the same;
the timing is honest.

### Backend module boundary — enforced from day one

```
backend/
  app/           ← FastAPI routes, request/response models, auth
  pdf_engine/    ← ALL PyMuPDF calls live here. Nothing else imports fitz.
  services/      ← Business logic; calls pdf_engine, never fitz directly
  tasks/         ← asyncio background tasks for OCR and macro jobs
  storage/       ← File lifecycle and annotation DB
```

`grep -r "import fitz" backend/app/` and `backend/services/` must always return empty.
Only `backend/pdf_engine/` may import fitz.

---

## 5. Annotation Persistence — Resolved

This was unresolved in v1. Here is the decision:

| Mode         | Storage           | Scope                          | Cleared when                     |
|--------------|-------------------|--------------------------------|----------------------------------|
| Preview mode | IndexedDB (idb)   | Browser, keyed by file hash    | User clears browser data         |
| Server mode  | SQLite (aiosqlite)| Server, keyed by file UUID     | User explicitly deletes document |

**Sync between modes:** None. Preview mode annotations are local to the browser.
When the user starts the server, they re-open the file there and start fresh.
This is honest — sync across modes is a Phase 6+ problem if it ever matters.

**IndexedDB vs localStorage:** IndexedDB has no practical size limit and survives
across sessions reliably. localStorage was the v1 choice — it fails above ~5 MB
of annotation data and gets cleared by aggressive browser privacy settings.

---

## 6. Two Honest Truths About OCR

### 6.1 Equation OCR accuracy

pix2tex accuracy on real documents:
- Clean digital PDFs with typeset equations: ~80–85%
- Scanned textbooks, good scan quality: ~65–75%
- Scanned textbooks, poor scan quality: ~40–60%
- Handwritten equations: ~20–40%

**Consequence:** The UI must include an equation correction workflow.
Every rendered equation has an edit button. Clicking it opens the raw LaTeX,
lets the user correct it, and re-renders via MathJax. This is not optional —
without it, wrong equations silently mislead users.

### 6.2 OCR performance thresholds

v1 invented numbers. These are **placeholders until benchmarked on target hardware.**
Run `tests/benchmark/ocr_benchmark.py` after setup and fill in real numbers.

| Metric                        | Target       | Status        |
|-------------------------------|--------------|---------------|
| Server OCR: 1 page, text      | TBD          | Benchmark first |
| Server OCR: 1 page, equations | TBD          | Benchmark first |
| Server OCR: 100-page book     | TBD          | Benchmark first |
| Preview OCR: 1 page           | < 20 sec     | Tesseract.js ceiling — acceptable |

### 6.3 Nougat Alternative (Removed)

Nougat is REMOVED from consideration.
CPU: 165–188 sec/page (small model, measured). 3–9× over the 20 sec target.
nougat-base license: CC-BY-NC-4.0 — non-commercial only.
No position output: cannot map equation blocks to page coordinates.

If full-page academic PDF parsing becomes a future requirement, evaluate:
- Marker (VikParuchuri, Apache 2.0) — CPU-viable, outputs Markdown+LaTeX
- DocTR (Mindee, Apache 2.0) — layout detection with bounding boxes
These remain in the Ideas Backlog, not in the active plan.

---

## 7. File Security and Temp File Lifecycle

**Server mode upload policy:**
- Maximum file size: 100 MB (enforced at FastAPI middleware level)
- Files stored in `storage/tmp/{uuid}/{filename}` — no path reconstruction
- TTL: 24 hours from last access; cleaned by a startup sweep on server restart
- Server listens on `127.0.0.1` only by default — not `0.0.0.0`

```python
# backend/app/config.py
class Settings(BaseSettings):
    host: str = "127.0.0.1"   # localhost only — must be explicit to expose
    port: int = 8000
    max_upload_mb: int = 100
    tmp_ttl_hours: int = 24
    tmp_dir: Path = Path("storage/tmp")
```

**Macro API auth:**
- Default: API key required, generated on first server start, written to `.env`
- Not passthrough. Not optional. The key is printed to console on first run.

---

## 8. OCR Error Recovery

v1 designed the happy path. These are the failure modes and their handling:

| Failure                          | Detection                          | Recovery                                                  |
|----------------------------------|------------------------------------|-----------------------------------------------------------|
| pix2tex crashes on a page        | Exception caught in task           | Page marked `status: 'equation-failed'`; raw image shown |
| Tesseract produces garbage       | Confidence < 0.3 on >50% of blocks | Page marked `status: 'low-confidence'`; user warned      |
| WebSocket drops mid-job          | Client reconnect with job ID       | Resume progress from last known page                      |
| Job takes > 30 min               | asyncio timeout                    | Job cancelled; partial results saved and available        |
| Server restart during job        | On-startup: check incomplete jobs  | Resume from last completed page (checkpoint per 10 pages) |

---

## 9. Debug Console — Moved Out of Shell

v1 made the debug console a persistent shell zone visible to all users.
That was wrong for a tool that may be used by non-developers.

**New design:**
- Debug console is accessed at `http://localhost:3000/debug` — a separate route
- `Ctrl+Shift+D` is retained as a keyboard shortcut that navigates to `/debug`
- The shell has zero debug UI — no dock, no toggle button in TopNav
- The `/debug` page is full-screen: Logs | State | Performance | System tabs
- In production builds (`VITE_ENV=production`), the `/debug` route is hidden

The structured logging service is unchanged — logs are still emitted and stored.
The console for reading them is just not in the main workspace.

---

## 10. Performance Targets (Revised)

| Metric                           | Target           | Note                              |
|----------------------------------|------------------|-----------------------------------|
| PDF open (< 10 MB), first page   | < 800 ms         | Measured from file select to paint|
| Page render at 100% zoom         | < 200 ms         | After document loaded             |
| Annotation save (server)         | < 100 ms         | SQLite write                      |
| Merge 5 PDFs (< 5 MB each)       | < 3 sec (preview)| pdf-lib in browser                |
| Merge 5 PDFs (< 5 MB each)       | < 1 sec (server) | PyMuPDF                           |
| OCR text/equation performance    | TBD              | Benchmark on target hardware first|

---

## 11. Roadmap Boundary

**This plan covers Phases 0–5 only.**

Anything beyond Phase 5 is in the **Ideas Backlog** — not planned, not estimated,
not designed. It exists so good ideas are not lost, not so they consume planning time.

| Phase | Name                            |
|-------|---------------------------------|
| P0    | Foundation + repo setup         |
| P1    | App shell + layout              |
| P2    | PDF rendering + viewer          |
| P3    | Annotations + persistence       |
| P4    | OCR + equation rendering        |
| P5    | Macro API + export              |

**Ideas Backlog (unplanned):**
- Form fill (AcroForm)
- Digital signature
- Redaction
- PDF comparison
- Collaborative editing
- Cloud storage connectors
