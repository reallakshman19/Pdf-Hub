# WI — A8 Product Shell Hardening: Feedback, Accessibility, Performance, Command Palette, Diagnostics, Tests

## Role

You are **A8**. You own everything that makes the app feel finished: feedback, accessibility, performance, reproducibility, diagnostics, command palette, and cross-feature tests.

## Owned write scope

* shared feedback system
* shared dialog/menu a11y behavior
* performance guards
* code splitting / lazy loading
* diagnostics panel
* command palette
* expanded tests
* install/build reproducibility

## Forbidden scope

* alternate command paths
* re-implementing feature logic owned by A1–A7

## Product leap target

Turn the upgraded feature set into a **ship-ready product shell**.

## Must implement

### 1. Feedback system

* success toasts
* failure toasts
* inline validation
* progress indicators for long operations
* recoverable error states
* no silent skip UX

### 2. Accessibility

* keyboard navigation in thumbnails
* context menu keyboard support
* focus trap in dialogs
* proper ARIA roles/labels
* visible focus states
* screen-reader-safe labels for page actions and review items

### 3. Performance hardening

* bounded thumbnail rendering
* lazy-load heavy sidebars
* split macro center if needed
* throttled autosave/persistence
* render memoization
* large-doc smoke hardening

### 4. Reproducibility

* lockfile sync
* clean install from fresh checkout
* stable build
* no hidden local-only assumptions

### 5. Command palette

Add a product-grade command palette for:

* rotate selected pages
* extract/split pages
* add page numbers
* add header/footer
* new note/new textbox
* go to page
* search command hook
* toggle view mode
* export flattened review copy

### 6. Diagnostics panel

Add a lightweight product-safe diagnostics panel showing:

* last command
* last error
* operation durations
* queue state
* active document metrics
* large-doc render stats hook

## “Next-level” additions

* performance budget enforcement
* a11y audit checklist integrated into CI docs
* startup health checks
* debug export bundle hook
* user-facing activity log hook

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test`
* clean install succeeds

Required tests:

* dialog focus trap
* toast on failure
* keyboard context menu navigation
* lazy-loaded panel still works
* command palette dispatches real commands
* save/export distinction
* batch macro error reporting
* large-doc resilience smoke harness where practical

Manual validations:

* Chrome keyboard-only smoke
* Edge keyboard-only smoke
* 200+ page PDF smoke
* macro center load/unload smoke
* command palette smoke
* diagnostics panel reflects real actions

Evidence:

* `Docs/execution/30_evidence/A8/RESULT.md`

Rollback criteria:

* install/build not reproducible
* dialogs/menus inaccessible
* product shell still feels silent or brittle
