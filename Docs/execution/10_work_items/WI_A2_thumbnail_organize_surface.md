# WI — A2 Thumbnail Rail as Professional Organize Surface

## Role

You are **A2**. You own the thumbnail rail as a real page-management environment.

## Owned write scope

* thumbnail sidebar
* thumbnail item component
* thumbnail context menu
* selected-page action strip
* page badges
* drag/reorder affordances
* page selection behavior in sidebar

## Forbidden scope

* command dispatch internals
* macro executor internals
* view rendering engine
* search result extraction
* comments thread logic

## Product leap target

Turn the left rail from “a list of previews” into a **filmstrip organizer**.

## Must implement

### 1. Right-click context menu

Support:

* rotate selected/current
* extract selected/current
* split selected/current
* duplicate selected/current
* delete selected/current
* insert blank before/after
* replace current page
* add page numbers
* add header/footer to selected/current
* batch text on selected/current
* reveal in organize mode

### 2. Selection semantics

Implement:

* click = single select
* Ctrl/Cmd = toggle
* Shift = range select
* right-click on unselected = select it
* right-click on selected set = keep full scope
* Esc clears context menu without clearing selection

### 3. Group drag/reorder

Implement:

* drag selected group as one unit
* insertion line/zone
* before/after semantics
* ghost summary for multi-page drag
* scroll-on-drag near viewport edges

### 4. Thumbnail badges

Show:

* current page
* selected state
* annotation count
* unresolved review count
* search hit count hook
* page label/custom label hook
* rotated indicator

### 5. Selected-page action strip

Quick actions:

* rotate
* duplicate
* extract
* split
* delete
* page numbers
* header/footer

## “Next-level” additions

* filmstrip density toggle
* thumbnail zoom slider
* page mini-metadata row
* unresolved review heat-strip
* page label/custom name support
* “show only pages with comments/search hits”

## Required UX rules

* context menu keyboard accessible
* all actions route through A1 dispatcher
* no accidental deselection while invoking context actions
* drop target feedback always visible during drag
* large documents do not freeze the rail

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- sidebar thumbnail`

Required tests:

* right-click selection behavior
* Shift range select
* group drag reorder
* context action dispatch
* badge count rendering
* action strip enable/disable logic

Negative tests:

* right-click does not deselect already-selected group
* drag reorder cannot create invalid page order
* action strip disabled for empty selection

Manual validations:

* 100+ thumbnails remain usable
* group drag indicator is obvious
* unresolved badge updates after review status changes
* current-page tracking stays correct during reorder

Evidence:

* `Docs/execution/30_evidence/A2/RESULT.md`

Rollback criteria:

* context menu conflicts with drag
* multi-select behavior ambiguous
* group drag corrupts selection or order
