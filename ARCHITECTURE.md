# PDF Hub — Current Architecture

> **Authoritative architecture document.**
>
> This file describes the current product direction and implementation reality.
> Older documents that describe DocCraft as a FastAPI/PyMuPDF server-first product are historical and must not be used as implementation authority.

## Product model

PDF Hub is a **local-first, browser-based PDF workspace**.

The primary product runs as a static React application. PDF rendering, page operations, annotations, OCR, Writer overlays, macros, persistence, and save/export flows execute locally in the browser.

The product goal is a professional/personal/basic PDF editor with:
- professional page organization, numbering, headers/footers, automation, large-document handling, mobile/web UX, and a future external API;
- personal OCR, comments, review and editable annotations;
- bounded editing of existing PDF text.

A backend is not required for the current core product.

## Current technology

### Application
- React 19
- TypeScript
- Vite
- Zustand

### PDF
- PDF.js / `pdfjs-dist` for rendering and text extraction
- `pdf-lib` for current PDF mutation/writing
- virtualized page rendering with `virtua`

### Review / annotation
- application annotation model + IndexedDB persistence
- Konva / React-Konva for portions of interactive overlay tooling
- current PDF save path still flattens application annotations; native editable PDF annotation serialization is planned

### OCR
- Tesseract.js
- browser workers and batching
- searchable-PDF export
- confidence/correction/table/region workflows

### Writer
- Writer V2 / Lexical-based editing and positioned document elements
- legacy Writer code remains and must be retired or clearly isolated

### Automation
- macro recipe engine
- preflight/dry-run support
- macro builder
- specialized PS/ISONOTE workflows

## Architectural boundaries

The target dependency direction is:

```text
Desktop UI / Mobile UI / Macro / API / Agent
                  |
                  v
              CommandBus
                  |
                  v
         DocumentTransaction
                  |
                  v
           DocumentSession
        /      |       |       \
     Pages  Review   Writer    OCR
        \      |       |       /
                  v
             PDF Engine
                  |
                  v
           DocumentSource
```

Not every current subsystem has reached this target. Refactors must move toward it rather than add new parallel state/command systems.

## Mandatory invariants

### 1. One canonical command model
UI, macros, future external API and agent-generated operations must converge on one serializable command contract.

The repository currently contains overlapping architecture-level `PdfCommand` and dispatch-level `DocumentCommand` models. This is acknowledged technical debt, not a pattern to extend.

### 2. One canonical state per concept
There should be one authoritative representation for:
- page
- annotation
- review thread
- OCR result/correction
- Writer element
- macro recipe
- document session

Do not add duplicate status or metadata fields as compatibility shortcuts without a migration plan.

### 3. Stable page identity
Page number/index is presentation state, not durable identity.

The target model uses a stable `PageId`, while visible page number, PDF `/PageLabels`, and printed page-number overlays are separate concepts.

### 4. One geometry service
PDF coordinates, rendered viewport coordinates and screen coordinates must be converted through shared geometry code.

Do not introduce feature-specific fixed page assumptions such as 595 × 842.

### 5. Original source is immutable during an editing session
The original PDF is the recovery anchor. Editing occurs through working state / operations and is compiled on save.

### 6. Save semantics must be explicit
The target semantics are:
- **Save / Save As:** preserve editable PDF-native annotations and supported editable document state
- **Export Flattened:** burn visual annotations/overlays into page content
- **Searchable PDF Export:** add OCR text layer
- **Download:** download the current persisted/working PDF representation

The current implementation does **not yet satisfy this target**. See `Docs/SAVE_SEMANTICS.md`.

## Current session and mutation model

`DocumentSession` currently stores original and working PDF bytes as `Uint8Array`.

Page mutations are dispatched through `core/commands/dispatch.ts` into `PdfEditAdapter`, with document transactions coordinating PDF bytes, annotations and history.

Current limitations:
- page identity is primarily index/number based;
- document history retains whole-PDF byte snapshots under a byte budget;
- several subsystems retain their own undo/history mechanisms;
- many structural operations load/rewrite the complete PDF.

These are migration targets, not desired long-term architecture.

## Rendering and large documents

PDF.js rendering is virtualized and cached. This is good and should be preserved.

However, the file layer currently reads the complete PDF using `File.arrayBuffer()` and applies a 100 MB admission limit. Therefore the app is **not yet a genuine large-PDF architecture** even though the UI is virtualized.

The target is a `DocumentSource` abstraction supporting random/range reads and OPFS/native-file-backed working data.

## OCR architecture

The OCR engine is intentionally local.

Production OCR UI must operate on the real active document. Demo/QA fixtures may remain as test infrastructure but must not be mounted in normal user workflows.

OCR region selection must ultimately occur against actual rendered page geometry rather than synthetic fixed-size preview canvases.

## Annotation and review architecture

Annotations and review/discussion are distinct concepts.

Target:
- `Annotation` = visual markup/anchor
- `ReviewThread` = review status and discussion
- `ReviewMessage` = individual message/reply

The current implementation still embeds review metadata in annotation data. Phase 1 will separate these concerns and add native PDF annotation serialization.

## Visual masks vs secure redaction

A visual mask is **not secure redaction**.

Current browser functionality can draw opaque page content but does not prove removal of underlying text, images, OCR text, annotations or content streams.

User-facing UI must call this feature **Visual Mask** and show the capability warning. Legacy internal command/op identifiers containing the word `redaction` may remain temporarily for compatibility but must not be presented as secure behavior.

## Desktop and mobile

Desktop and mobile should share the engine and document model but may have separate interaction shells.

The existing `MobileShell` approach is intentional. Do not replace it with desktop UI merely compressed by CSS.

## Testing requirements

Maintain a permanent PDF fidelity corpus covering, at minimum:
- ordinary and scanned PDFs
- mixed page sizes and rotations
- CropBox / MediaBox differences
- bookmarks/outlines
- PageLabels
- AcroForms
- existing annotations
- attachments and metadata
- tagged PDFs
- CID/subset fonts
- Arabic/CJK/RTL
- object streams and incremental revisions
- encrypted and signed PDFs
- malformed-but-readable xrefs

For structural mutations, test:
1. open
2. mutate
3. save
4. reopen
5. validate/render
6. mutate again
7. save again
8. reopen again

## Roadmap authority

The active product roadmap is tracked in GitHub issue **#167**.

When an old design/work-item document conflicts with:
1. this file,
2. issue #167, or
3. current production code,

treat the old document as historical unless it has been explicitly re-authorized.

## What not to add yet

Until the stabilization roadmap is complete, avoid expanding:
- annotation type count
- OCR subsystems/panels
- macro operation count
- parallel command/history systems
- cloud/backend architecture
- collaboration
- signature creation
- Word-like global text reflow

The immediate objective is coherence, correctness and PDF fidelity—not feature count.
