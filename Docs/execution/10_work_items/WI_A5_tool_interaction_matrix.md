# WI — A5 Tool Interaction Matrix + Review Markup Mechanics

## Role

You are **A5**. You own the interaction contract for tools, selection, text-marking, placement, marquee, anchor drag, and keyboard transform semantics.

## Owned write scope

* workspace interaction controller
* text selection overlay
* selection bubble
* marquee behavior
* annotation placement/move/resize contracts
* tool-state matrix docs and implementation

## Forbidden scope

* search list UI
* macro builder UI
* thumbnail rail
* review thread sidebar

## Product leap target

Turn the current mixed pointer behavior into a **predictable professional markup system**.

## Must implement

### 1. Formal interaction matrix

Define and enforce:

* `select`: text selection + object selection + marquee
* `highlight/underline/strikeout`: text selection only
* `sticky-note/callout`: selection-to-create and click-to-place
* `textbox/shape/line/arrow/stamp`: canvas placement only
* marquee only in select mode
* hand tool disables markup interactions
* locked items are non-editable/non-movable

### 2. Text selection action bubble

Include:

* highlight
* underline
* strikeout
* sticky note
* callout
* dismiss
* keyboard-safe behavior

### 3. Remove fake text-mark creation

No empty-page click may create highlight/underline/strikeout pseudo-objects.

### 4. Group interaction

* multi-select move
* group resize for resizable box types
* anchor drag for callout
* keyboard nudge
* shift-constrained movement hook

### 5. Unified note semantics

Normalize `comment` vs `sticky-note`; ship one coherent note concept.

## “Next-level” additions

* snap-to-page/snap-to-annotation guides
* z-order controls hook
* align/distribute polish
* annotation preset styles
* selection inspector hook
* contextual cursors for every transform state

## Required UX rules

* no accidental object drag during text marking
* no stuck selection bubble
* no tool ambiguity
* Esc always cancels the current transient interaction
* Enter/Meta+Enter behavior consistent for text commit

## Strict pass tests

Automated:

* `corepack pnpm --filter frontend exec tsc --noEmit`
* `corepack pnpm --filter frontend lint`
* `corepack pnpm --filter frontend test -- workspace interaction annotations`

Required tests:

* highlight tool selects text directly
* underline tool selects text directly
* strikeout tool selects text directly
* note/callout from selected text
* fake text marks blocked
* marquee only in select mode
* locked annotations protected

Manual validations:

* no pointer-event conflicts between text layer and annotation overlay
* text-mark tools usable without switching back to select
* callout anchor drag works predictably
* group resize preserves sanity

Evidence:

* `Docs/execution/30_evidence/A5/RESULT.md`

Rollback criteria:

* text-marking still only reliable in select mode
* pointer-event bugs reappear
* note tools remain conceptually duplicated
