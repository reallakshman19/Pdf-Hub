# WI — A6 Macro Center + Organize Dialogs + Batch Ops

## Role

You are **A6**. You own macro productization and the replacement of all prompt-driven organize flows with typed, validated, product-grade dialogs.

## Owned write scope

* macro sidebar
* organize toolbar dialogs
* macro variable inputs
* donor-file management UX
* batch-run UX
* macro logs and reports
* organize modal forms

## Forbidden scope

* command dispatcher internals
* search result extraction
* view rendering engine
* review sidebar thread model

## Product leap target

Turn macros from “power feature with rough edges” into a **Macro Center**.

## Must implement

### 1. Replace all prompt-driven flows

Dialog-driven replacements for:

* insert blank page
* replace page
* donor page selection
* batch text
* batch recipe selection
* header/footer configuration
* page-numbering options

### 2. Macro Center

Support:

* built-in recipes
* preset save/rename/duplicate/delete
* variable inputs
* per-step parameter forms
* donor-file binding
* dry run
* run log
* output queue
* job summary

### 3. Dry run

Must be real:

* validation only
* no document mutation
* no output write
* explicit preflight report

### 4. Batch runner hardening

* continue on error
* per-file result cards
* downloadable JSON summary
* reproducibility info:

  * recipe id
  * recipe snapshot
  * params
  * timestamp
  * input file name/hash
  * failure reason if any

### 5. Usability depth

* recipes grouped by category
* parameter presets
* inline validation
* actionable output queue: Save / Save All / Clear / Retry Failed

## “Next-level” additions

* macro recorder for supported command flows
* favorite recipes
* last-used values memory
* reusable variable templates
* “apply recipe to current selection/current page/all pages” quick-scope chooser
* job history panel

## Required UX rules

* no blocking browser dialogs
* no hidden auto-save
* donor-dependent steps blocked until valid
* logs readable by normal users, not only developers

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- macro toolbar-organize`

Required tests:

* dry-run does not mutate document
* invalid donor mapping blocks run
* preset lifecycle works
* continue-on-error batch works
* output queue state correct
* dialog validation blocks bad submits

Manual validations:

* run page-number recipe
* run header/footer on selected pages
* run batch text recipe
* run same recipe on multiple files
* one-file failure does not abort entire batch

Evidence:

* `Docs/execution/30_evidence/A6/RESULT.md`

Rollback criteria:

* prompts remain in organize flows
* dry-run is fake
* donor-file features still inaccessible from UI
