# WI — A4 View Modes, Fit Modes, Hand Tool, Large-Doc Rendering

## Role

You are **A4**. You own runtime rendering behavior for how documents are viewed.

## Owned write scope

* workspace layout/rendering
* page virtualization
* view mode behavior
* fit mode behavior
* hand tool behavior
* page centering/scroll restoration policy

## Forbidden scope

* macro panel
* search sidebar logic
* review sidebar logic
* command history internals

## Product leap target

Turn view controls from dead state into a **robust document viewport system**.

## Must implement

### 1. Continuous mode

* virtualized page list
* stable scroll
* bounded concurrent page renders
* render-window tuning hooks

### 2. Single-page mode

* only current page shown
* neighbor prefetch optional
* predictable keyboard/page navigation

### 3. Two-page mode

* correct spread pairing
* first-page treatment
* centered spread layout
* page gap policy

### 4. Fit modes

* fit width
* fit page
* recompute on container resize
* respect current mode

### 5. Hand tool

* drag-to-pan
* cursor state
* no accidental annotation interactions when active

### 6. Scroll/page restoration

* preserve user context when changing mode
* maintain stable page anchor where possible

## “Next-level” additions

* mini-map hook
* focus mode / distraction-free mode
* presentation mode hook
* viewport state memory per document
* smooth center-on-selection API for search/comments

## Performance requirements

* large docs: no full rerender storm
* page virtualization required
* memoize page surfaces
* avoid duplicate thumbnail/render pipelines where possible

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- view workspace`

Required tests:

* mode switch changes layout
* fit width/page affect zoom
* hand tool pans
* current page preserved across mode changes
* resize recomputes fit correctly

Performance validations:

* 200+ page smoke
* repeated mode toggles
* rapid resize smoke

Manual validations:

* continuous feels continuous
* two-page feels like spreads, not a hack
* single-page mode does not leak other pages
* mode switching does not feel jumpy

Evidence:

* `Docs/execution/30_evidence/A4/RESULT.md`

Rollback criteria:

* view controls still only change store state
* virtualized mode breaks page operations
* pan conflicts with annotation tools
