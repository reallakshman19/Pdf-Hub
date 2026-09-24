# PDF Hub Public SDK

Status: **Phase 12 — first production slice**

PDF Hub exposes a typed browser SDK over the active canonical document session:

```ts
window.PDFHubSDK
```

The SDK is intentionally different from the older `window.PDFHubHeadless` compatibility bridge.

- `PDFHubSDK` is session-bound and executes canonical commands through `commandBus.execute()`.
- `PDFHubHeadless` remains the legacy byte-oriented macro/headless bridge and is not removed by Phase 12.

## API version

The first SDK contract reports:

```ts
PDFHubSDK.apiVersion === '1'
PDFHubSDK.getCapabilities()
```

Capability discovery is the runtime source of truth for command types exposed by that SDK version.

## Inspect the active session

```ts
const session = PDFHubSDK.inspectSession()

session.documentKey
session.fileName
session.pageCount
session.pageGraph
session.currentPageId
session.selectedPageIds
```

Page identity is the canonical stable `PageId` from the active `PageGraph`. Numeric page positions are compatibility/render coordinates and can change after structural mutations.

The returned snapshot is detached from Zustand-owned arrays and PageGraph objects. Mutating it does not mutate the editor session.

## Read current PDF bytes

```ts
const bytes = PDFHubSDK.getWorkingPdfBytes()
```

The SDK returns a defensive `Uint8Array` copy. Callers never receive the session store's mutable byte reference.

The method returns `null` when no PDF is open.

## Execute a canonical command

```ts
const execution = await PDFHubSDK.executeCommand({
  type: 'ROTATE_PAGES',
  payload: {
    pageIndices: [0],
    angle: 90,
  },
})

if (!execution.result.success) {
  console.error(execution.result.error)
}
```

The SDK:

1. reads the active session identity;
2. materializes the existing canonical `PdfCommandDraft`;
3. assigns source `api`;
4. enters through `commandBus.execute()`;
5. therefore retains the document-operation queue, validation, transaction, PageGraph, history and session semantics of in-product mutations.

There is no SDK-specific mutation dispatcher or parallel command schema.

## Supported command surface in API version 1

The first slice exposes:

- `ROTATE_PAGES`
- `REORDER_PAGES`
- `REORDER_PAGES_BY_ORDER`
- `EXTRACT_PAGES`
- `SPLIT_PAGES`
- `DELETE_PAGES`
- `INSERT_BLANK_PAGE`
- `DUPLICATE_PAGES`
- `SET_PAGE_LABELS`
- `APPLY_HEADER_FOOTER_TEMPLATE`
- `DRAW_TEXT_ON_PAGES`
- `DRAW_REDACTION_BOX`

Use `getCapabilities().commandTypes` instead of hard-coding availability.

## Explicitly unsupported in the first slice

The SDK does not expose:

- `INSERT_PAGES`
- `REPLACE_PAGE`
- `MERGE_PDF`

Those operations require donor admission capabilities that do not yet have a safe public SDK contract.

The SDK also does not expose internal/state-only compatibility commands:

- `ANNOTATION_CHANGE`
- `WRITER_CHANGE`
- `APPLY_WORKING_COPY`

Passing an unsupported command through an untyped caller fails with `PdfHubSdkError` code `UNSUPPORTED_COMMAND`.

## No active document

Command execution requires an active PDF session.

If none exists, execution rejects with:

```ts
PdfHubSdkError {
  code: 'NO_ACTIVE_DOCUMENT'
}
```

The SDK does not fabricate a session or silently switch to the legacy headless byte path.

## Cancellation and binary resources

```ts
await PDFHubSDK.executeCommand(draft, {
  abortSignal,
  binaryResources: {
    logo: pngBytes,
  },
})
```

Binary resources remain out of band and are defensively copied at the SDK boundary.

Donor PDFs are intentionally not accepted by this first slice.

## Session subscription

```ts
const unsubscribe = PDFHubSDK.subscribeSession((session) => {
  console.log(session.documentKey)
})

// later
unsubscribe()
```

The current snapshot is emitted immediately unless `{ emitCurrent: false }` is supplied.

Consumers receive SDK snapshots, not the Zustand store or its mutation methods.

## Compatibility boundary

`window.PDFHubHeadless` remains available for existing integrations. Phase 12 does not reinterpret legacy macro recipes as canonical SDK commands.

New browser integrations should prefer `PDFHubSDK` when they operate on the active PDF Hub editing session.

A later Phase 12 slice may add donor admission, package/module distribution and broader event contracts. Those additions must extend this canonical command/session path rather than introduce a second execution system.
