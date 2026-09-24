# PDF Hub Public SDK

Status: **Phase 12 — production SDK surface under active development**

PDF Hub exposes a typed browser SDK over the active canonical document session:

```ts
window.PDFHubSDK
```

The SDK is intentionally different from the older `window.PDFHubHeadless` compatibility bridge.

- `PDFHubSDK` is session-bound and executes canonical commands through `commandBus.execute()`.
- `PDFHubHeadless` remains the legacy byte-oriented macro/headless bridge and is not removed by Phase 12.

## API version

The current SDK contract reports:

```ts
PDFHubSDK.apiVersion === '1'
PDFHubSDK.getCapabilities()
```

Capability discovery is the runtime source of truth for command types, donor admission, runtime validation, module-entry support and typed SDK events exposed by that SDK version.

## Module consumption

The frontend workspace now exposes a side-effect-free source module entry:

```ts
import {
  createPdfHubSdk,
  PDF_HUB_SDK_API_VERSION,
  type PdfHubSdk,
} from 'frontend/sdk'
```

The private workspace package maps `./sdk` to `src/sdk.ts`. Importing this entry does **not** install `window.PDFHubSDK`; browser-global installation remains isolated to application startup through `core/sdk/browserGlobal`.

This is a source/workspace module contract, not an npm/public-registry publication claim. The frontend package remains `private`.

## Runtime validation

TypeScript callers get `PdfHubSdkCommandDraft` types derived from the canonical `PdfCommandDraft` union. Untyped JavaScript callers are also guarded at runtime.

The SDK performs only safe top-level shape checks itself, then materializes the canonical command and delegates payload validation to the existing `validateCommand()` authority. Malformed command inputs fail with:

```ts
PdfHubSdkError {
  code: 'INVALID_ARGUMENT'
  details?: string[]
}
```

Unsupported but well-formed command types still fail with `UNSUPPORTED_COMMAND`.

Donor admission requests also validate the target, donor list, file names and `Uint8Array` byte inputs before reading or parsing donor PDFs.

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
5. retains the document-operation queue, validation, transaction, PageGraph, history and session semantics of in-product mutations.

There is no SDK-specific mutation dispatcher or parallel command schema.

## Supported command surface in API version 1

The current surface exposes:

- `ROTATE_PAGES`
- `REORDER_PAGES`
- `REORDER_PAGES_BY_ORDER`
- `EXTRACT_PAGES`
- `SPLIT_PAGES`
- `DELETE_PAGES`
- `INSERT_PAGES`
- `INSERT_BLANK_PAGE`
- `REPLACE_PAGE`
- `DUPLICATE_PAGES`
- `MERGE_PDF`
- `SET_PAGE_LABELS`
- `APPLY_HEADER_FOOTER_TEMPLATE`
- `DRAW_TEXT_ON_PAGES`
- `DRAW_REDACTION_BOX`

Use `getCapabilities().commandTypes` instead of hard-coding availability.

The SDK still does not expose internal/state-only compatibility commands:

- `ANNOTATION_CHANGE`
- `WRITER_CHANGE`
- `APPLY_WORKING_COPY`

Passing an unsupported command through an untyped caller fails with `PdfHubSdkError` code `UNSUPPORTED_COMMAND`.

## Donor admission

Donor-backed structural commands use the shared PDF Hub donor-admission boundary. Raw donor bytes are never embedded inside the canonical command.

First admit donors for exactly one command target:

```ts
const admission = await PDFHubSDK.admitDonors({
  commandTarget: 'MERGE_PDF',
  donors: [
    {
      fileName: 'appendix-a.pdf',
      bytes: appendixABytes,
    },
    {
      fileName: 'appendix-b.pdf',
      bytes: appendixBBytes,
    },
  ],
})

admission.admissionId
admission.donors[0].resourceId
```

The public admission result contains only opaque resource IDs and metadata:

- file name;
- source byte count;
- page count.

It does **not** expose the internal `AdmittedDonorPdf` capability object, donor handles, or resolved donor bytes.

Admission reuses the existing donor policy, PDF signature check, parse/page-count validation, cancellation behavior and document-context binding.

### Execute with admitted resources

```ts
await PDFHubSDK.executeCommand({
  type: 'MERGE_PDF',
  payload: {
    donorResourceIds:
      admission.donors.map(
        (donor) => donor.resourceId,
      ),
  },
})
```

The SDK resolves opaque IDs back to private admitted capabilities and passes them to CommandBus through `CommandResources.donors`.

A donor command must use:

- the same active document;
- the same command target used for admission;
- one admission only;
- the complete admitted resource set;
- the original admission order.

`INSERT_PAGES` and `REPLACE_PAGE` require exactly one admitted donor. `MERGE_PDF` accepts one or more.

A donor execution attempt is single-use. The SDK releases its public resource IDs after the command attempt whether the command succeeds or fails. Reusing those IDs fails with `DONOR_ADMISSION_INVALID`.

### Abandon an admission

```ts
PDFHubSDK.releaseDonorAdmission(
  admission.admissionId,
)
```

This revokes an admitted set that will not be dispatched. The method returns `true` when an active admission was released and `false` when the ID was already absent.

## No active document

Command execution and donor admission require an active PDF session.

If none exists, they reject with:

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

Donor admission also accepts `abortSignal` on `admitDonors(...)`.

## SDK events

For integrations that need lifecycle observation beyond session snapshots:

```ts
const unsubscribe = PDFHubSDK.subscribeEvents((event) => {
  switch (event.type) {
    case 'session-changed':
      console.log(event.session.documentKey)
      break
    case 'command-started':
      console.log(event.commandId, event.commandType)
      break
    case 'command-finished':
      console.log(event.success, event.mutated)
      break
    case 'donor-admitted':
      console.log(event.admission.admissionId)
      break
    case 'donor-released':
      console.log(event.reason)
      break
  }
})
```

The event stream exposes SDK snapshots and metadata only. It does not expose Zustand, the internal document event bus, donor capabilities, resolved donor bytes, or command output byte arrays.

The current session is emitted immediately as a `session-changed` event unless `{ emitCurrentSession: false }` is supplied. Listener exceptions are isolated from SDK command/admission execution.

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

A later Phase 12 slice may add emitted library artifacts/public package publication, version negotiation beyond API v1, richer integration helpers and long-lived compatibility policy. Those additions must extend this canonical command/session path rather than introduce a second execution system.
