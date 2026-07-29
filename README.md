# Pdf-Hub

A client-side PDF editor and toolkit. It runs entirely in the browser — there
is no backend. PDFs are opened, rendered, annotated, and exported all on the
client, using `pdfjs-dist` for rendering and `pdf-lib` for byte-level PDF
manipulation.

**Live**: https://reallaksh19.github.io/Pdf-Hub/ (deployed from `main` via
`.github/workflows/deploy.yml`, GitHub Pages).

## What it does today

- **View and navigate** PDFs (page thumbnails, search, outline/bookmarks,
  zoom/fit modes).
- **Annotate**: highlights, shapes, ink, stamps, sticky notes, callouts,
  redaction — rendered on a Konva canvas layered over the PDF.
- **Organize pages**: reorder, rotate, split, merge, insert/delete.
- **OCR**: client-side text recognition via `tesseract.js`, with region
  selection, confidence review, correction, and a searchable-PDF export path.
- **Writer**: a rich-text/document-authoring overlay (Lexical-based) for
  placing text, tables, and images on a page, plus a legacy simpler overlay.
- **Macros**: a recipe/step system for automating PDF operations, including a
  domain-specific PS/ISONOTE workflow (`frontend/src/core/macro/psIsonote/`)
  for parsing tabular support data and placing annotated callouts.
- **Review**: comments and review-status tracking across annotations, with
  export to JSON/text summaries.
- **Redaction, generate (AI-assisted command preview), history/undo-redo,
  session persistence** (IndexedDB via `idb`).

## Quickstart

```bash
# Node version is pinned in .nvmrc; use it (nvm use, or match manually).
pnpm install --frozen-lockfile
cd frontend
pnpm dev          # start the dev server
pnpm run test:ci  # run the test suite
pnpm run typecheck
pnpm run build    # production build to frontend/dist
```

The workspace root only contains the `frontend` package
(`pnpm-workspace.yaml`) — everything lives under `frontend/`.

## Architecture map

```
frontend/
  src/
    core/        Framework-agnostic logic: PDF rendering adapters, session
                 store, annotations, macro engine, OCR pipeline, writer
                 document model, commands/history, redaction, review.
                 No React imports here.
    adapters/    Thin wrappers around external libraries (pdfjs-dist,
                 pdf-lib, tesseract.js, file I/O) that core/ depends on
                 through an interface, not directly on the library.
    components/  React UI, organized by feature area (viewer, sidebar,
                 toolbar, writer, writer-v2, ocr, annotations, macro, ...).
```

State is managed with Zustand stores under `core/*/store.ts`, one per
domain (session, annotations, OCR, writer, review, ...). Guard scripts in
`scripts/` (`guard-scope.mjs`, `guard-forbidden.mjs`, `guard-ratchet.mjs`)
enforce a handful of structural rules — see `AGENT_PROTOCOL.md`.

## Where the docs live

- `AGENT_PROTOCOL.md` — the loop this codebase's upgrade work follows:
  scoped task cards in `tasks/*.json`, verified exit criteria, one commit
  per task. Read this before making a multi-file change.
- `tasks/DRIFT-REPORT.md` — a running log of dependency/CI drift and other
  findings discovered while executing that plan, including several the
  original audit's file:line citations no longer matched (the codebase had
  moved on since it was written).
- `tasks/STATE.json` — which task is active and what's blocked.
- `Docs/` — design and execution documentation from earlier phases of this
  project (architecture notes, UI specs, phase-by-phase execution records).
  Some of it (e.g. `ARCHITECTURE.md` at the repo root) describes an earlier,
  larger planned architecture — a server-mode FastAPI backend, Celery,
  PyMuPDF — that was not built; the app that exists today is the frontend
  described above.
- `knownissues.md`, `knowncodeoptimisation.md` — informal running notes on
  known bugs and possible optimizations, predating the structured audit.

## License

MIT — see `LICENSE-frontend`.
