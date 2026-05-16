# WI — A3 Search with Hit Geometry + Deep Navigation

## Role

You are **A3**. You own product-grade search.

## Owned write scope

* search state
* search panel
* top-nav search wiring
* search result model
* page hit highlighting
* thumbnail hit badges
* search navigation hooks

## Forbidden scope

* macro UI
* thumbnail context menu logic
* review thread model
* command dispatcher internals

## Product leap target

Turn search from “string matching” into **document navigation intelligence**.

## Must implement

### 1. Search panel

Features:

* query box
* result count
* grouped by page
* snippets
* hit navigation
* active result
* clear/reset
* persistent query state while document remains open

### 2. Hit geometry

Support:

* hit rectangles where possible
* active hit highlight on page
* scroll-to-hit
* highlight persistence until next query or clear

### 3. Top-nav integration

* debounced search
* Enter = next hit
* Shift+Enter = previous hit
* escape clears active hit focus
* clear button resets panel and canvas highlights

### 4. Thumbnail integration

* hit count per page
* filter pages with hits
* jump from hit to page reliably

### 5. Deep-link foundation

Add state shape for:

* search result deep link
* future bookmark/comment/search convergence

## “Next-level” additions

* search history dropdown
* regex toggle hook
* case/whole-word toggle
* page heatmap strip
* pin current search
* “convert search hit to bookmark/comment” hook point

## Required UX rules

* no duplicate hit rendering
* stable active result state
* large result sets remain responsive
* query changes clear stale hit selection cleanly

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- search`

Required tests:

* grouped results by page
* click result jumps correctly
* next/previous cycles correctly
* active hit highlight renders
* hit count badge updates
* clear resets search state

Negative tests:

* empty query is not treated as error
* changing query invalidates old active result
* large document search does not lock UI in test harness

Manual validations:

* repeated searches on same doc remain stable
* active hit survives page switching
* top-nav search and sidebar search stay in sync

Evidence:

* `Docs/execution/30_evidence/A3/RESULT.md`

Rollback criteria:

* stale active-hit state after query change
* mismatch between panel result and canvas highlight
* search panel remains stub-like
