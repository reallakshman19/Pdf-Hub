# Performance Budget

This document establishes the hard performance constraints that all agents (specifically A4 and A8) must enforce to ensure a responsive frontend experience.

## Large Document Handling
- **Constraint:** The application must remain responsive and interactive when loading and rendering documents with 200+ pages.
- **Metric:** Scrolling, zooming, and view mode switching must maintain 60fps or have acceptable frame delivery without visible locking of the main thread.
- **Implementation Strategy:** Virtualization of the rendering model. Out-of-viewport elements must be culled or aggressively debounced.

## Resize and Layout Re-calculation
- **Constraint:** Window resize and sidebar toggle events must trigger layout recalculations without extreme blocking.
- **Metric:** Fit mode updates must resolve within 100ms.
- **Implementation Strategy:** Debounce resize observers and layout adjustments.

## Document History Operations
- **Constraint:** Applying undo/redo transactions must be near-instant.
- **Metric:** Reverting complex document mutations (e.g., mass annotations or page deletions) must not freeze the UI for more than 200ms.

## Macro Batch Processing
- **Constraint:** Running a macro queue containing multiple operations against a document must process asynchronously or show clear progress without hanging the browser.

## Current Verification Snapshot (2026-04-22)
- Continuous mode uses virtualized list rendering (`virtua`) in workspace and thumbnail rails.
- Build passes with chunk split sidebars (`SearchPanel`, `BookmarksSidebar`, `CommentsSidebar`, `ThumbnailSidebar`) loaded lazily.
- Full 200+ page browser profiling remains a manual release gate item.
