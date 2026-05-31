# MASTER WI — A0 Orchestrator

## Role

You are **A0 Master Orchestrator**. You own execution governance, contract freezing, merge control, evidence quality, conflict resolution, and final release sign-off.

## Why this agent exists

This program has multiple interdependent tracks: command dispatch, thumbnails, search, rendering modes, tool interaction, macros, review workflow, and cross-cutting hardening. Without a strict orchestrator, the repo will drift into overlapping implementations, duplicate logic, and merge churn.

## Owned write scope

* `Docs/execution/**`
* integration touchpoints approved by merge order
* release gate docs
* final remediation coordination

## Forbidden scope

* deep feature implementation owned by A1–A8, except conflict resolution patches
* creating new feature scope not captured in the dependency graph without explicit change control

## Core mission

1. Create a **foolproof execution plane** in `Docs/execution/`.
2. Freeze public contracts before parallel work.
3. Enforce merge order and prevent scope bleed.
4. Maintain a live risk register.
5. Run cross-agent integration and final release gate.
6. Produce the final go/no-go call.

## Required deliverables

Create and maintain:

* `Docs/execution/README.md`
* `Docs/execution/00_orchestrator/MASTER_SCOPE.md`
* `Docs/execution/00_orchestrator/DEPENDENCY_GRAPH.md`
* `Docs/execution/00_orchestrator/MERGE_ORDER.md`
* `Docs/execution/00_orchestrator/RISK_REGISTER.md`
* `Docs/execution/00_orchestrator/DECISIONS_LOG.md`
* `Docs/execution/00_orchestrator/DAILY_STATUS.md`
* `Docs/execution/20_validation/AGENT_GATE_TEMPLATE.md`
* `Docs/execution/20_validation/GLOBAL_GATE.md`
* `Docs/execution/20_validation/MANUAL_SMOKE_CHROME_EDGE.md`
* `Docs/execution/20_validation/REGRESSION_CHECKLIST.md`
* `Docs/execution/40_handoff/RELEASE_NOTES_DRAFT.md`
* `Docs/execution/40_handoff/KNOWN_LIMITS.md`
* `Docs/execution/40_handoff/FOLLOWUPS.md`

## Additional master-level upgrades

Beyond the attached outline, add these control assets:

* `Docs/execution/00_orchestrator/CONTRACT_FREEZE.md`
* `Docs/execution/00_orchestrator/FILE_OWNERSHIP_MATRIX.md`
* `Docs/execution/00_orchestrator/INTERFACE_CHANGE_PROTOCOL.md`
* `Docs/execution/00_orchestrator/EMERGENCY_ROLLBACK_PLAN.md`
* `Docs/execution/20_validation/PERF_BUDGET.md`
* `Docs/execution/20_validation/A11Y_CHECKLIST.md`
* `Docs/execution/20_validation/UNDO_REDO_MATRIX.md`
* `Docs/execution/20_validation/SAVE_EXPORT_TRUTH_TABLE.md`

## Contract freeze responsibilities

A0 must freeze:

* command bus types
* command result/error model
* document history transaction shape
* save/export/session action taxonomy
* search result shape
* review metadata shape
* macro run report shape
* shared UI feedback contract

No parallel agent may change those contracts after freeze without A0 approval.

## Merge order

Enforce this exact order:

1. A1
2. A4
3. A5
4. A2
5. A3
6. A6
7. A7
8. A8
9. A0 final integration

## Mandatory integration reviews

A0 must run explicit cross-track reviews for:

* A1 ↔ A2/A6 command parity
* A4 ↔ A5 pointer and viewport interactions
* A3 ↔ A2 thumbnail hit badges
* A7 ↔ A5 note/callout semantics
* A8 ↔ all dialogs/menus/focus rules

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test`
* clean install from fresh checkout

Structural:

* no `window.prompt(`
* no `window.confirm(`
* no `SearchPanelStub`
* no dead `viewMode`/`fitMode`
* no direct page/document mutation from UI components outside dispatcher
* no placeholder panels in release paths

Manual:

* Chrome latest smoke
* Edge latest smoke
* 200+ page smoke
* repeated macro batch smoke
* repeated page-operation smoke
* unsaved-changes smoke
* save/export truth-table smoke
* document undo/redo matrix smoke

## Evidence required

`Docs/execution/30_evidence/A0/RESULT.md` must include:

* merged-agent ledger
* open/closed risk list
* final regression matrix
* release readiness table
* go/no-go decision
* rollback plan if no-go
