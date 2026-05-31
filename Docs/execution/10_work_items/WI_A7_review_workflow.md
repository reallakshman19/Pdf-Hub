# WI — A7 Review Workflow Productization

## Role

You are **A7**. You own the app’s transformation from annotation canvas into a proper review product.

## Owned write scope

* review/comments sidebar
* review metadata model
* reply/thread support
* inspector review fields
* review summary export
* hide-resolved integration

## Forbidden scope

* command bus
* macro executor
* thumbnail organize behavior
* core view rendering engine

## Product leap target

Turn markup into **review workflow**.

## Must implement

### 1. Review sidebar

Features:

* group by page
* filter by open/resolved/rejected
* type badge
* jump-to-annotation
* bulk resolve/reopen/reject
* sort by page/date/status

### 2. Metadata depth

Add:

* author
* createdAt
* updatedAt
* reviewStatus
* optional title/category/tag
* reply count

### 3. Thread model

* static storage-safe reply threads
* reply creation/edit/delete
* stable linkage to parent annotation

### 4. Canvas/sidebar coherence

* click sidebar row → jump + select + reveal
* hide resolved toggle on canvas
* resolved state still visible in sidebar/reporting

### 5. Export review summary

Support:

* JSON
* readable summary panel
* counts by status/type/page

## “Next-level” additions

* review priority/severity
* assignee hook
* due-date hook
* summary heatmap by page
* unresolved review density badges in thumbnails
* “open items only” mode

## Required UX rules

* sidebar is authoritative review index
* replies never orphan
* resolved items are easy to find even when hidden on canvas
* no mismatch between review status badge and filter results

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- review comments inspector`

Required tests:

* filter by status
* jump-to-annotation
* bulk resolve/reopen
* hide-resolved behavior
* reply thread persistence
* review summary export

Manual validations:

* create note → reply → resolve → filter → reopen
* row click always navigates correctly
* exported review summary matches sidebar counts

Evidence:

* `Docs/execution/30_evidence/A7/RESULT.md`

Rollback criteria:

* sidebar remains a flat annotation dump
* replies break navigation
* hide-resolved causes discoverability loss
