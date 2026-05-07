# File Ownership Matrix

This document defines the file ownership and modification scope for each agent to prevent execution drift and overlapping implementations.

## Agent Ownership Definitions

* **A0 (Master Orchestrator)**
  - `Docs/execution/**`
  - Integration touchpoints
  - Release gate and validation documents
  - Strict enforcement of merge control

* **A1 (Command Bus + Document History)**
  - `core/commands/*` (dispatch, types, execution logic)
  - `core/document-history/*` (undo/redo transaction model)
  - `core/session/*` (save/export semantics)

* **A2 (Thumbnail Organize Surface)**
  - `components/thumbnails/*`
  - Thumbnail drag-and-drop, context menus, and selection models

* **A3 (Search Geometry + Navigation)**
  - `core/search/*` (hit geometry, active models)
  - `components/search/*` (UI rendering for hits and navigation)

* **A4 (View Mode Rendering Model)**
  - `core/rendering/modes/*`
  - Handling of continuous, single-page, two-page, and fit modes

* **A5 (Tool Interaction Matrix)**
  - `components/tools/*`
  - Text selection, highlighting, underlining, notes, and callout UI/logic

* **A6 (Macro Productization)**
  - `core/macros/*`
  - Macro dry-run, execution queue, and output file management
  - Macro dialogs and configuration UI

* **A7 (Review Workflow)**
  - `core/review/*` (thread metadata, review export)
  - `components/sidebar/review/*` (sidebar filters, annotation navigation)

* **A8 (Feedback, A11y, Perf, Tests)**
  - Global accessibility checks (keyboard, ARIA)
  - Performance improvements (virtualization, resize recalculations)
  - Testing suite expansion (smoke tests, regressions, performance constraints)
