# Implementation Plan – DocCraft Redesign

This document outlines the high‑level steps to migrate the current PDF Hub prototype into the **DocCraft** workbench described in the redesign.  The objective is to translate the design vision into a phased implementation, ensuring that each feature is grounded in a command–based architecture with undo/redo support and auditable operations.  The plan also describes the sequencing of work across front‑end and back‑end components.

## Goals

1. **Foundation shell:** Build the structural scaffolding for the application—top navigation bar, mode tabs, context–sensitive toolbar, left rail, main document view and right inspector.  All tools will be surfaced honestly; unimplemented tools should be disabled with explanatory text.
2. **Command contract:** Define a stable schema for commands and results.  Commands must be serialisable, reversible (where possible) and auditable.  Every user action—from annotation to page extraction—flows through this contract.
3. **Incremental delivery:** Deliver features in waves, starting with view and basic annotation, then page organisation, search/bookmarks, OCR workflow, AI/macro generation and finally redaction.  Each wave unlocks additional parts of the design while preserving stability.
4. **Performance:** Prevent UI jank by fetching page metrics up front and rendering only what is visible.  Implement an LRU page cache, cancel offscreen renders and prefetch upcoming pages.  Future improvements can include streaming large PDFs from the server.

## Phases

### Wave 0 – Contract & Documentation

* Create `frontend/src/core/commands/types.ts` defining all command and result types.
* Create `frontend/src/core/commands/registry.ts` and `store.ts` for registering and dispatching commands.
* Add `docs/OPERATION_CONTRACT.md` to describe the command lifecycle and invariants (preview, confirm, execute, undo).  Include a description of risk levels (safe vs destructive).
* Add `docs/AGENT_WORK_OWNERSHIP.md` to clarify which agent is responsible for each module.
* Add `docs/REDESIGN_GAP_REGISTER.md` and `docs/PERFORMANCE_BENCHMARKS.md` to track unimplemented features and performance targets.

### Wave 1 – Shell

* Scaffold the React components that make up the workbench: `AppShell`, `TopNav`, `ToolbarBand`, `LeftRail`, `SidebarPanel`, `DocumentWorkspace`, `InspectorPanel` and `StatusBar`.
* Create a simple editor state store in `frontend/src/core/editor/store.ts` with a mode property and convenience actions to change it.
* Ensure that the shell renders correctly even though most tools are not yet implemented.  Disabled buttons should be clearly labelled.

### Wave 2 – Viewer & Performance

* Implement `PdfRendererAdapter` to load, cache and render PDF pages via PDF.js.  Precompute page dimensions to prevent layout shifts and reserve accurate placeholder heights.
* Create a virtualised viewer (`PdfViewer` and `PageCanvas`) that renders only visible pages and cancels offscreen renders.  Use an LRU cache to reuse parsed pages.
* Add a text layer that reuses parsed text items from the adapter rather than recalculating them each render.

### Wave 3 – Command System & History

* Build the command dispatcher, validator and undo/redo stacks.  Every toolbar action should create a command, optionally display a preview, and then dispatch the command for execution.
* Update the UI to read from and write to the command system.

### Subsequent Waves

Following waves will implement annotation tools, page organisation, OCR, AI generation, bookmarks, search and, finally, redaction.  Each wave builds on the underlying command system and uses the shell components created in earlier phases.

## Assumptions

* The back‑end will be implemented using FastAPI and PyMuPDF.  All `fitz` imports live under `backend/pdf_engine` to comply with the architecture guidelines.
* In preview mode, documents and annotations are stored client‑side in IndexedDB.  In server mode, documents live in a persistent store (e.g. SQLite) behind REST endpoints.
* Large files will eventually be streamed to the client via range requests; however, initial waves will work with in‑memory buffers.

## Conclusion

The DocCraft redesign is ambitious, but by breaking the work into discrete, testable waves and agreeing on a robust command contract up front, we can deliver incremental value without destabilising the existing prototype.  The documents added in this phase make the design explicit and provide a roadmap for contributors.
