# WI — A1 Command Bus + Document History + Save/Export Truth

## Role

You are **A1**. You own the architectural spine. All document/page actions must route through your layer. You also own document-mutation undo/redo and the semantic truth of save/export/session behavior.

## Owned write scope

* `frontend/src/core/commands/**`
* `frontend/src/core/document-history/**`
* `frontend/src/core/session/types.ts`
* `frontend/src/core/session/store.ts`
* integration adapters used by toolbar, thumbnail menu, macro runner, keyboard shortcuts
* save/export/session action contracts

## Forbidden scope

* search UI
* thumbnail UI layout
* annotation rendering
* macro visual builder
* review thread UI

## Product leap target

Turn the app from “several controls that mutate a PDF” into a **transactional document editor**.

## Must implement

### 1. Typed command system

Define:

* `DocumentCommand`
* `DocumentCommandId`
* `CommandSource`
* `CommandPayload`
* `CommandContext`
* `CommandResult`
* `CommandError`
* `CommandTelemetryEvent`

Support commands for:

* rotate pages
* reorder pages
* duplicate pages
* extract pages
* split pages
* delete pages
* insert blank page
* replace page
* apply header/footer
* apply page numbers
* batch text draw
* macro recipe run
* export flattened review copy
* save working document
* save session snapshot

### 2. Dispatcher

Create one dispatcher that is the only valid entrypoint for:

* toolbar actions
* thumbnail context menu actions
* macro actions
* keyboard shortcuts
* command palette hooks

### 3. Document-mutation history

Implement transaction-safe undo/redo for:

* page operations
* page content mutations
* macro-driven document mutations

History requirements:

* reversible transaction object
* human-readable action label
* timestamp
* source surface
* optional grouped transaction
* rollback-safe error path

### 4. Save/export/session semantics

Build an explicit taxonomy:

* **Save working document**
* **Save session snapshot**
* **Export flattened review copy**
* **Download processed PDF**

Produce a truth table that states exactly what each contains:

* page mutations
* annotations
* review status
* bookmarks/custom nav
* UI state
* temporary macro logs

### 5. Dirty-state model

Track separately:

* document dirty
* review dirty
* session dirty

### 6. Telemetry/debug hooks

Add structured events for:

* command start
* command success
* command failure
* elapsed time
* payload scope
* source surface

No analytics service required; local debug/event sink is enough.

## “Next-level” additions

* action ledger panel hook point
* command replay support for supported operations
* grouped transaction batching
* command-idempotency guards where appropriate
* destructive command preview summary object
* future-compatible command palette schema

## Required deliverables

* full command type system
* command registry
* dispatcher
* document history store
* transaction serializers
* save/export truth table doc
* migration patch replacing direct document mutation from UI

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- core/commands core/document-history core/session`

Required tests:

* toolbar/macro/thumbnail dispatch parity
* undo/redo for rotate
* undo/redo for header/footer
* undo/redo for split/delete
* transaction grouping
* save/export truth-table expectations
* dirty-state transitions
* failure path leaves history consistent

Negative tests:

* malformed payload rejected
* unsupported command source rejected
* dry-run command cannot mutate document state

Manual validations:

* apply rotate from 3 surfaces, identical result
* undo/redo document mutation
* export flattened review copy is distinguishable from save working doc
* no stale dirty-state after save/export

Evidence:

* `Docs/execution/30_evidence/A1/RESULT.md`

Rollback criteria:

* any UI path still mutates document bytes directly
* undo/redo corrupts working bytes
* save/export labels remain semantically ambiguous
