# Redesign Gap Register

This document records the **major gaps** between the envisioned PDF Hub/DocCraft workbench and
the current implementation.  It serves as a living register of issues to address
as development proceeds.  Each entry below summarizes the gap, its risk, and an
outline of the work required to close it.

## 1. Write mode ambiguity

The design includes a rich **Write** toolbar with font selection, alignment,
tables, images and links.  Without clear scoping this can mislead users into
believing the application provides full word–processor‐style editing.  True
editing of PDF content streams is technically complex and dangerous.

**Gaps:**

* Lack of separation between overlay writing, PDF content editing and new
  document authoring.
* No UI to warn users that overlay writing does not modify existing text.

**Required work:**

1. Implement separate modes for overlay writing, advanced content edit and
   document authoring.
2. Add clear labels and warnings to communicate scope.
3. Persist overlay objects separately from base document until commit.

## 2. High‑risk redaction

Redaction cannot be implemented as a simple black rectangle overlay.  A redaction
tool must permanently remove underlying text, images, annotations and OCR text
from the final PDF.

**Gaps:**

* No preview/apply workflow for redaction.
* No audit logging or verification of removed content.
* No safe default to force saving as a new file.

**Required work:**

1. Implement `REDACTION_PREVIEW` and `REDACTION_APPLY` commands with
   confirmation dialogs.
2. Use PyMuPDF in the backend to remove text, images, annotations and OCR
   layers.
3. Produce audit reports describing what was removed.

## 3. Organize mode and thumbnails

The design calls for robust page manipulation: insert, delete, duplicate,
rotate, replace, merge, extract and split.  For professional PDF work this
panel must support multiple selection and drag‑and‑drop interactions.

**Gaps:**

* No thumbnail component or selection logic exists.
* No multi‑select, shift‑select or ctrl/cmd‑select support.
* No drag‑reorder or visual insertion markers.

**Required work:**

1. Create a thumbnail panel with badges for page labels, sizes, rotation,
   annotations and OCR status.
2. Implement a robust selection model supporting range and additive
   selection.
3. Add drag‑and‑drop reordering and cross‑document merging.

## 4. OCR workflow

Current design mentions **Auto OCR** and **Region** tools but leaves many
questions unanswered.  Scanned books often have hundreds of pages and OCR
should be a resumable, inspectable process.

**Gaps:**

* No OCR queue or per‑page status display.
* No language selection or searchable text toggle.
* No confidence metrics or equation editing UI.

**Required work:**

1. Introduce an OCR store and progress panel.
2. Provide language selection and a way to re‑run OCR on specific pages.
3. Render OCR results (including equations) in an overlay with confidence
   indicators and allow manual correction.

## 5. AI/Generate guardrails

The proposed **Generate** mode includes macros, smart fill, Ask AI and other
powerful tools.  Without guardrails, these features could unexpectedly change
documents.

**Gaps:**

* There is no infrastructure for generating command plans with previews.
* AI suggestions could bypass user confirmation.

**Required work:**

1. Require every AI suggestion to produce a list of commands for preview.
2. Validate proposed commands and surface warnings/errors.
3. Record the source of all AI actions in the command history for audit.
