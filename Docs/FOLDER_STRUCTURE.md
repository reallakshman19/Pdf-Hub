> **Historical document — not authoritative.**
>
> This file describes the former DocCraft server-first/FastAPI layout. The current product is local-first/browser-based. Use the root `ARCHITECTURE.md` and roadmap issue #167 for current architecture and module direction.

# DocCraft — Folder Structure (v2)

> Changes from v1:
> - pdf_engine/ isolated in backend (PyMuPDF boundary)
> - Celery/Redis removed; asyncio tasks folder replaces it
> - storage/ has defined tmp/ and db/ structure
> - debug/ route replaces DebugConsoleDock in shell
> - Adapter extraction deferred (introduced in Phase 2-3, not Phase 0)
> - Annotation persistence: idb in frontend, aiosqlite in backend
> - Roadmap cut to Phase 5

---

## Root

```
doccraft/
├── frontend/               # React SPA — MIT license
├── backend/                # FastAPI + PyMuPDF — AGPL-3.0 license
├── sdk/                    # Python PDFClient for macro scripts — MIT
├── tests/
│   ├── e2e/                # Playwright specs (per phase)
│   ├── fixtures/           # Shared test PDFs + mock JSON
│   ├── benchmark/          # OCR + render benchmarks (run before setting thresholds)
│   └── snapshots/          # Playwright visual snapshots
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AGENTS.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── FOLDER_STRUCTURE.md
│   ├── VERIFICATION_SYSTEM.md
│   ├── UI_DESIGN_SPEC.md
│   └── IDEAS_BACKLOG.md     # Phase 6+ ideas, no estimates
├── .github/
│   └── workflows/
│       ├── ci.yml           # lint → typecheck → unit → e2e → build
│       └── deploy-pages.yml # Preview mode static deploy
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── LICENSE-frontend         # MIT
├── LICENSE-backend          # AGPL-3.0
└── README.md
```

---

## Frontend

```
frontend/
├── public/
│   ├── pdf.worker.min.js       # PDF.js worker
│   └── tesseract/              # Tesseract.js WASM + eng.traineddata only
│
├── src/
│   ├── main.tsx                # [P0] Entry — single createRoot call
│   ├── App.tsx                 # [P1] Router: / = WorkspacePage, /debug = DebugPage
│   │
│   ├── core/                   # Domain layer — pure TypeScript
│   │   ├── capabilities/
│   │   │   ├── types.ts        # [P0] AppCapabilities, AppMode
│   │   │   ├── resolver.ts     # [P0] Ping /api/ping → mode
│   │   │   └── useCapabilities.ts
│   │   │
│   │   ├── session/
│   │   │   ├── types.ts        # [P0] DocumentSession, ViewState
│   │   │   └── store.ts        # [P0] Zustand session store
│   │   │
│   │   ├── annotations/
│   │   │   ├── types.ts        # [P0] PdfAnnotation, AnnotationType, Rect
│   │   │   ├── store.ts        # [P3] Annotation CRUD + undo/redo
│   │   │   └── persistence.ts  # [P3] IndexedDB (preview) / REST (server)
│   │   │
│   │   ├── ocr/
│   │   │   ├── types.ts        # [P0] OcrJob, OcrResult, OcrPageResult
│   │   │   │                   #      EquationBlock, OcrStatus (includes
│   │   │   │                   #      'equation-failed', 'low-confidence')
│   │   │   └── store.ts        # [P4] OCR job management
│   │   │
│   │   ├── editor/
│   │   │   ├── types.ts        # [P0] EditorState, ActiveTool
│   │   │   └── store.ts        # [P1] UI state (active tool, panels)
│   │   │
│   │   └── logger/
│   │       ├── types.ts        # [P0] AppLogEntry, LogLevel, LogSource
│   │       ├── service.ts      # [P0] log(), warn(), error()
│   │       └── store.ts        # [P0] Ring buffer, max 500 entries
│   │
│   ├── adapters/               # Introduced in Phase 2-3 as coupling becomes clear
│   │   │                       # NOT created in Phase 0 — extracted when needed
│   │   ├── pdf-renderer/       # [P2] Extracted when PageCanvas needs isolation
│   │   │   ├── PdfRendererAdapter.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── annotation-canvas/  # [P3] Extracted when FabricAdapter shape is clear
│   │   │   ├── FabricAdapter.ts
│   │   │   ├── serializer.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── ocr-preview/        # [P4]
│   │   │   └── TesseractAdapter.ts
│   │   │
│   │   ├── ocr-server/         # [P4]
│   │   │   └── OcrApiAdapter.ts
│   │   │
│   │   └── equation/           # [P4]
│   │       └── MathJaxAdapter.ts
│   │
│   ├── components/
│   │   ├── shell/              # [P1] Layout zones
│   │   │   ├── AppShell.tsx    # Top/toolbar/main/status — NO debug dock
│   │   │   ├── TopNav.tsx      # No debug toggle button
│   │   │   ├── ToolbarBand.tsx
│   │   │   ├── LeftRail.tsx
│   │   │   ├── SidebarPanel.tsx
│   │   │   ├── DocumentWorkspace.tsx
│   │   │   ├── InspectorPanel.tsx
│   │   │   └── StatusBar.tsx
│   │   │
│   │   ├── toolbar/            # [P1] Toolbar groups
│   │   │   ├── ToolbarFile.tsx
│   │   │   ├── ToolbarOrganize.tsx
│   │   │   ├── ToolbarComment.tsx
│   │   │   ├── ToolbarOcr.tsx
│   │   │   └── ToolbarView.tsx
│   │   │
│   │   ├── sidebar/            # [P1] shell → filled per phase
│   │   │   ├── ThumbnailPanel.tsx     # [P2]
│   │   │   ├── BookmarksPanel.tsx     # [P2]
│   │   │   ├── CommentsPanel.tsx      # [P3]
│   │   │   ├── SearchPanel.tsx        # [P2]
│   │   │   └── OcrJobsPanel.tsx       # [P4]
│   │   │
│   │   ├── viewer/             # [P2]
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── PageCanvas.tsx
│   │   │   ├── TextLayer.tsx
│   │   │   ├── AnnotationOverlay.tsx  # [P3]
│   │   │   └── EquationOverlay.tsx    # [P4]
│   │   │
│   │   ├── annotation/         # [P3]
│   │   │   ├── TextBoxTool.tsx
│   │   │   ├── HighlightTool.tsx
│   │   │   ├── StampTool.tsx
│   │   │   ├── ShapeTool.tsx
│   │   │   ├── FreehandTool.tsx
│   │   │   └── CommentTool.tsx
│   │   │
│   │   ├── ocr/                # [P4]
│   │   │   ├── OcrLauncher.tsx
│   │   │   ├── OcrProgress.tsx
│   │   │   ├── OcrResultOverlay.tsx
│   │   │   └── EquationEditor.tsx     # correction UI — edit wrong LaTeX
│   │   │
│   │   ├── inspector/          # [P1] shell → [P3] behavior
│   │   │   ├── PropertiesTab.tsx
│   │   │   ├── StyleTab.tsx
│   │   │   └── MetadataTab.tsx
│   │   │
│   │   ├── preview-banner/     # [P0] Always-visible in preview mode
│   │   │   └── PreviewModeBanner.tsx
│   │   │
│   │   └── ui/                 # [P0] Shared primitives
│   │       ├── Button.tsx
│   │       ├── Badge.tsx
│   │       ├── Tooltip.tsx
│   │       ├── Modal.tsx
│   │       ├── Tabs.tsx
│   │       ├── Separator.tsx
│   │       └── FeaturePlaceholder.tsx
│   │
│   ├── pages/
│   │   ├── WorkspacePage.tsx   # [P1] Main editor
│   │   ├── MacroConsolePage.tsx# [P5] Server mode only
│   │   └── DebugPage.tsx       # [P0] /debug route — dev tool, not shell zone
│   │
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useResizablePanel.ts
│   │   └── useDarkMode.ts
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── themes.css          # Light-first. Dark via .dark class.
│   │   └── tailwind.css
│   │
│   └── test-utils/
│       ├── renderWithProviders.tsx
│       ├── mockCapabilities.ts
│       └── mockStore.ts
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Backend

```
backend/
├── app/
│   ├── main.py             # [P0] FastAPI factory, CORS, middleware
│   ├── config.py           # [P0] Settings — host=127.0.0.1, max_upload=100MB
│   │
│   ├── api/
│   │   ├── ping.py         # [P0] GET /api/ping + GET /api/capabilities
│   │   ├── files.py        # [P2] POST /api/files/upload
│   │   ├── pages.py        # [P2] GET /api/files/{id}/pages/{n}
│   │   ├── annotations.py  # [P3] CRUD /api/annotations (aiosqlite)
│   │   ├── ocr.py          # [P4] POST /api/ocr/start
│   │   ├── ocr_ws.py       # [P4] WS  /ws/ocr/{job_id}
│   │   └── macro.py        # [P5] POST /api/macro/job
│   │
│   ├── auth/
│   │   └── apikey.py       # [P0] API key middleware — generated on first start
│   │                       #      localhost requests: key optional
│   │                       #      non-localhost requests: key required
│   │
│   └── domain/
│       ├── models.py       # [P0] Pydantic request/response models
│       └── errors.py       # [P0] Typed error responses
│
├── pdf_engine/             # ← ONLY place that imports fitz
│   ├── __init__.py
│   ├── reader.py           # [P2] Open PDF, extract pages, get text blocks
│   ├── writer.py           # [P2] Save, merge, split, rotate, delete pages
│   ├── inserter.py         # [P5] Insert image/text/table at coordinates
│   ├── header_footer.py    # [P5] Add header/footer to pages
│   ├── region_classifier.py# [P4] Classify page regions: text/image/equation
│   └── types.py            # [P2] PdfRegion, TextBlock, PageInfo — pure types
│
├── services/
│   ├── pdf_service.py      # [P2] Calls pdf_engine — never imports fitz directly
│   ├── ocr_service.py      # [P4] Pipeline: classify → tesseract → pix2tex
│   ├── macro_service.py    # [P5] Orchestrates pdf_engine operations
│   └── export_service.py   # [P5] Flatten annotations into PDF
│
├── tasks/
│   ├── ocr_task.py         # [P4] asyncio task for per-page OCR
│   │                       #      Checkpoints every 10 pages to storage
│   │                       #      Reports progress via WS
│   └── macro_task.py       # [P5] asyncio task for macro operations
│
├── storage/
│   ├── file_store.py       # [P2] UUID-based tmp/ file management + TTL cleanup
│   ├── annotation_db.py    # [P3] aiosqlite annotation CRUD
│   └── job_store.py        # [P4] In-memory job registry + checkpoint file
│
├── tests/
│   ├── test_ping.py
│   ├── test_pdf_engine.py
│   ├── test_ocr_service.py
│   ├── test_file_store.py  # TTL cleanup tests
│   └── fixtures/
│       ├── simple.pdf
│       ├── equations.pdf
│       ├── scanned.pdf
│       └── multipage.pdf
│
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
└── pyproject.toml
```

---

## Tests

```
tests/
├── benchmark/
│   ├── ocr_benchmark.py       # Run this before setting OCR thresholds
│   │                          # Outputs: pages/sec, sec/page by type
│   └── render_benchmark.py    # PDF.js render time per page
│
├── e2e/
│   ├── fixtures/
│   │   ├── simple-text.pdf     # 2 pages, clean digital text
│   │   ├── equations-sample.pdf# 3 pages, typeset equations (digital)
│   │   ├── scanned-sample.pdf  # 2 pages, rasterized scan
│   │   └── merge-parts/
│   │       ├── part-a.pdf      # 5 pages
│   │       └── part-b.pdf      # 7 pages
│   │
│   ├── specs/
│   │   ├── p0-shell.spec.ts    # App loads, mode detected, /debug route exists
│   │   ├── p1-layout.spec.ts   # All zones render, panels resize
│   │   ├── p2-viewer.spec.ts   # PDF opens, pages render, zoom, keyboard nav
│   │   ├── p3-annotations.spec.ts  # Create, edit, undo, persist
│   │   ├── p4-ocr.spec.ts          # OCR runs, progress fires, equations render as SVG
│   │   └── p5-macro.spec.ts        # Merge, header/footer, export
│   │
│   ├── helpers/
│   │   ├── uploadPdf.ts
│   │   ├── waitForOcr.ts
│   │   └── getStoreState.ts
│   │
│   └── playwright.config.ts
│
└── fixtures/
    ├── mock-capabilities-preview.json
    ├── mock-capabilities-server.json
    ├── mock-document-session.json
    ├── mock-annotations.json
    ├── mock-ocr-result-text.json
    ├── mock-ocr-result-equations.json
    └── mock-ocr-result-failures.json  # equation-failed + low-confidence cases
```

---

## SDK

```
sdk/
├── pdfclient/
│   ├── __init__.py
│   ├── client.py       # [P5] PDFClient — chainable operations
│   ├── job.py          # [P5] Job.run() with asyncio progress
│   └── operations.py   # [P5] Typed operation builders
├── examples/
│   ├── add_header_footer.py
│   ├── batch_ocr.py
│   └── merge_and_ocr.py
├── README.md
└── setup.py            # MIT license
```

---

## Phase file creation summary

| Phase | New folders/files created                                           |
|-------|---------------------------------------------------------------------|
| P0    | core/{capabilities,session,editor,logger}, components/ui, components/preview-banner, pages/DebugPage, app/{main,config,auth,domain}, storage/ |
| P1    | components/shell, components/toolbar, components/sidebar (shells), components/inspector (shells), pages/WorkspacePage |
| P2    | adapters/pdf-renderer, components/viewer/{PdfViewer,PageCanvas,TextLayer}, sidebar/{ThumbnailPanel,BookmarksPanel,SearchPanel}, pdf_engine/{reader,writer}, api/{files,pages}, storage/file_store |
| P3    | adapters/annotation-canvas, components/annotation/*, components/ocr/EquationEditor stub, sidebar/CommentsPanel, storage/annotation_db, api/annotations |
| P4    | adapters/{ocr-preview,ocr-server,equation}, components/ocr/*, sidebar/OcrJobsPanel, pdf_engine/region_classifier, services/ocr_service, tasks/ocr_task, api/{ocr,ocr_ws} |
| P5    | adapters/macro, pages/MacroConsolePage, pdf_engine/{inserter,header_footer}, services/{macro_service,export_service}, tasks/macro_task, api/macro, sdk/ |
