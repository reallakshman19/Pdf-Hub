# PDF Hub Headless Command API

The headless command API is a narrow browser integration surface over PDF Hub's canonical command model.

It is **not** the final public SDK. The current command surface intentionally supports only logical PDF PageLabels while the broader SDK remains a later roadmap phase.

## Browser global

The application initializes:

```ts
window.PDFHubHeadless
```

with three functions:

```ts
PDFHubHeadless.execute(bytes, recipe, fileName?, donorFiles?, options?)
PDFHubHeadless.inspectDocument(bytes, options?)
PDFHubHeadless.executeCommand(bytes, draft, options?)
```

`execute` is the existing legacy macro entrypoint.

`inspectDocument` and `executeCommand` are the canonical-command bridge.

## Inspect before using PageIds

PageLabel ranges are anchored by stable `PageId`, not page numbers.

For a headless byte buffer:

```ts
const inspection = await PDFHubHeadless.inspectDocument(bytes)

inspection.documentKey
inspection.pageGraph.pages[0].pageId
```

The returned PageIds belong to those exact source bytes.

## Execute the canonical PageLabels draft

The supported headless command type is exactly:

```ts
Extract<PdfCommandDraft, { type: 'SET_PAGE_LABELS' }>
```

Example:

```ts
const inspected = await PDFHubHeadless.inspectDocument(bytes)

const nextBytes = await PDFHubHeadless.executeCommand(bytes, {
  type: 'SET_PAGE_LABELS',
  payload: {
    ranges: [
      {
        startPageId: inspected.pageGraph.pages[0].pageId,
        prefix: 'Cover',
      },
      {
        startPageId: inspected.pageGraph.pages[1].pageId,
        style: 'roman-lower',
        startNumber: 1,
      },
    ],
  },
})
```

The API uses the same runtime command validation, PageLabel domain validation, derived PageGraph labeling, and PDF writer path as the in-app `SET_PAGE_LABELS` command.

There is no separate API PageLabel request schema.

## Re-inspect after mutation

The headless `documentKey` is derived from the exact PDF bytes.

A successful mutation produces new bytes and therefore a new document identity. Before submitting another PageId-anchored command, inspect the new bytes again:

```ts
const nextInspection = await PDFHubHeadless.inspectDocument(nextBytes)
```

Do not carry PageIds from an older byte revision into a new headless command.

## Cancellation

Both `inspectDocument` and `executeCommand` accept:

```ts
{ abortSignal?: AbortSignal }
```

The inspection hash/build and PageLabels mutation observe the supplied signal through the existing cancellation infrastructure.

## Automate relationship

Automate's Logical Page Labels task does **not** use the legacy macro DSL. It reuses the Page Labels UI and dispatches the same canonical `SET_PAGE_LABELS` command through `CommandBus`.

General multi-step macro recipes still commit through the opaque `APPLY_WORKING_COPY` compatibility boundary. A `set_page_labels` macro DSL operation is intentionally not introduced until macro structural steps can preserve stable PageId intent end-to-end.
