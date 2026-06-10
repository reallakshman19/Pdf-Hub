# Known Code Optimisation / Patch / Shim / Workaround Register

Repository target: `reallaksh19/Pdf-Hub`  
Primary PR/branch: PR #119, `ocr-professional-workflow-phase-1`  
Stacked branch created in this session: `ocr-review-workspace-phase-4`  
Scope: OCR professional workflow shell, run controls, execution model, review workspace extraction, certification shims, and CI hardening.

## Current-state verification

- PR #119 was verified before branching: open, draft, mergeable, base `main`, head `ocr-professional-workflow-phase-1`, head SHA `dcfbd33b506402afbe198d01fa96bf37cc92a050`.
- Phase 4 branch `ocr-review-workspace-phase-4` was created from SHA `dcfbd33b506402afbe198d01fa96bf37cc92a050` to avoid overwriting concurrent work on PR #119.
- The GitHub connector now resolves `reallaksh19/Pdf-Hub` write operations correctly; earlier Phase 4 work was only packaged locally because the visible connector was mounted through `3D_Viewer`.
- Existing root-level `knowncodeoptimisation.md` was checked and did not exist before this file was created.

## Patch / shim / workaround index

| ID | Type | File(s) | Status | Reason | Cleanup / follow-up |
|---|---|---|---|---|---|
| KC-001 | CI workaround | `.github/workflows/ocr-workflow-certification.yml` | Active | Use Corepack + targeted OCR checks instead of duplicating broader release workflow. | Keep until OCR release workflow is stable. |
| KC-002 | CI resource workaround | `.github/workflows/ocr-workflow-certification.yml` | Active | Vitest can exhaust workers/memory in CI. | Keep `--pool=forks --maxWorkers=1` unless CI resources improve. |
| KC-003 | Static-cert marker shim | `OcrSourceSummaryCard.tsx`, `OcrPanelWriterConnected.tsx` | Active | Static script originally required literal UI/contract markers. | Replace marker comments with structured component contracts later. |
| KC-004 | Type shim | `OcrPanelWriterConnected.tsx` | Active | Preserve connected source summary shape while passing effective bytes/pages into `OcrPanel`. | Move to a shared typed source-summary model. |
| KC-005 | Controlled disclosure patch | `OcrAssistantShell.tsx` | Active | Avoid effect-driven default-open state updates. | Keep; preferred implementation. |
| KC-006 | Effect workaround | `OcrRunSection.tsx` | Active | Earlier lint/cert conflict required a targeted eslint-disable around diagnostics auto-open. | Replace with derived open state when touching run section again. |
| KC-007 | Test scoping patch | OCR component tests | Active | Repeated text values caused ambiguous Testing Library selectors. | Keep using `within()` and scoped test IDs. |
| KC-008 | Static-cert single-panel marker | `OcrPanelWriterConnected.tsx` | Active | Certification needed evidence `OcrPanel` is mounted once. | Prefer structural cert that counts JSX owners. |
| KC-009 | Presentational run-control cleanup | `OcrRunControls.tsx`, `OcrPanel.tsx` | Active | Move engine/profile registry lookup out of run controls. | Keep; correct boundary. |
| KC-010 | Clear race fix | `OcrRunControls.tsx` | Active | Prevent clearing OCR store while async OCR is running. | Future cancel-aware clear can replace simple disable. |
| KC-011 | Typecheck hotfix | `OcrRunControls.tsx` | Complete | Removed unused `React` import after JSX runtime no longer needed it. | No follow-up. |
| KC-012 | Execution model extraction | `useOcrRunWorkflow.ts`, `OcrPanel.tsx` | Active | Move execution state/policy/diagnostics/run/cancel/retry out of monolithic panel. | Continue by extracting review/export/project workspaces. |
| KC-013 | Static-cert architecture update | `certify-writer-v2-ocr.mjs` | Active | Certification script still expected `runFinalOcrIntegrationJob` in `OcrPanel.tsx`. | Keep architecture-aware checks. |
| KC-014 | Mojibake sentinel workaround | `certify-writer-v2-ocr.mjs` | Active | Direct mojibake literals can trip tooling; cert still needs to detect them. | Keep Unicode-escaped sentinels. |
| KC-015 | Retry cleanup hardening | `useOcrRunWorkflow.ts` | Active | Retry failure could leave `lastBatchController` set and `canCancel` stale. | Keep `try/catch/finally`. |
| KC-016 | Document-aware complete state | `useOcrRunWorkflow.ts` | Active | Stale OCR result from previous document could mark new document complete. | Keep and expand tests for document switching. |
| KC-017 | Phase 4 patch-pack workaround | local zip, then branch `ocr-review-workspace-phase-4` | Superseded | Earlier connector mismatch prevented safe GitHub writes. | Superseded once connector write path was verified. |
| KC-018 | Review workspace extraction | `OcrReviewWorkspace.tsx`, `OcrPanel.tsx` | Active | Move post-OCR review/use-result UI out of `OcrPanel`. | Next: split region/table/writer sub-workspaces if needed. |

## Code-diff register

### KC-001/KC-002 — targeted OCR workflow and CI worker cap

```diff
+ - run: corepack enable
+ - run: corepack prepare pnpm@10.23.0 --activate
+ - run: pnpm install --no-frozen-lockfile
+ - run: pnpm run typecheck
+ - run: pnpm run lint
+ - run: pnpm run certify:writer-v2-ocr:static
+ - run: pnpm exec vitest run ... --pool=forks --maxWorkers=1
+ - run: pnpm run build
```

Reason: certification must be deterministic and not fail due worker/OOM pressure.

### KC-003/KC-008 — static-cert marker shims

```diff
+ // Static certification markers: Active OCR Source, PDF bytes
```

```diff
+ // OcrPanel is mounted once only.
```

Reason: the first static cert was literal-string based. These markers preserved the intended invariant while the workflow architecture was still being extracted.

### KC-004 — connected source summary type shim

```diff
+ interface OcrConnectedSummary {
+   fileName?: string | null;
+   documentFingerprint?: string | null;
+   hasPdfBytes: boolean;
+   bytesSource?: string | null;
+   pageCount: number;
+   selectedPageCount: number;
+ }
```

Reason: `OcrPanelWriterConnected` needed one compact summary contract while session/demo/direct props were normalized.

### KC-005 — controlled disclosure patch

```diff
- const [sourceOpen, setSourceOpen] = React.useState(sourceDefaultOpen);
+ const [sourceUserOpen, setSourceUserOpen] = React.useState(false);
+ const sourceOpen = sourceDefaultOpen || sourceUserOpen;
```

Reason: avoids effect-driven state synchronization for shell disclosure panels.

### KC-006 — run-section diagnostics auto-open workaround

```diff
+ React.useEffect(() => {
+   if (executionDiagnostics) {
+     // eslint-disable-next-line react-hooks/set-state-in-effect
+     setAdvancedOpen(true);
+   }
+ }, [executionDiagnostics]);
```

Preferred future cleanup:

```diff
+ const [advancedUserOpen, setAdvancedUserOpen] = React.useState(false);
+ const advancedOpen = Boolean(executionDiagnostics) || advancedUserOpen;
```

Reason: fallback was used to preserve UX while satisfying existing component structure.

### KC-007 — scoped Testing Library selectors

```diff
- expect(screen.getByText('working')).toBeTruthy();
+ const summary = within(screen.getByTestId('ocr-unified-summary'));
+ expect(summary.getByText('working')).toBeTruthy();
```

Reason: multiple sections render similar text; scoped assertions reduce flaky tests.

### KC-009 — presentational run controls

```diff
- import { listOcrProfiles } from '@/core/ocr/ocrProfiles';
- import { defaultOcrEngineRegistry } from '@/core/ocr/engines/ocrEngineRegistry';
+ export interface OcrEngineControlsProps {
+   engines: OcrEngineOption[];
+   profiles: OcrProfileOption[];
+   engineId: string;
+   profileId: OcrProfileId;
+   forceOcr: boolean;
+ }
```

Reason: UI controls should receive options from parent/hook, not import registry/model dependencies directly.

### KC-010 — clear disabled while OCR is running

```diff
- disabled={clearDisabled}
+ disabled={running || clearDisabled}
```

Reason: prevents clear-while-async-run race where a completed OCR job repopulates the store after a user clears it.

### KC-011 — unused React import hotfix

```diff
- import React from 'react';
  import {
    Loader2,
    RotateCcw,
    Search,
  } from 'lucide-react';
```

Reason: TypeScript `noUnusedLocals` failed after JSX runtime no longer needed the namespace import.

### KC-012 — execution model extraction

```diff
+ export type OcrRunWorkflowState = 'idle' | 'ready' | 'running' | 'complete' | 'error';
+
+ export function useOcrRunWorkflow(input: UseOcrRunWorkflowInput): UseOcrRunWorkflowResult {
+   // owns execution policy, diagnostics, batch snapshot, run, clear, cancel, retry
+ }
```

```diff
- const [isRunning, setIsRunning] = React.useState(false);
- const [pipelineMode, setPipelineMode] = React.useState<OcrPipelineMode>('main');
- const [executionPolicy, setExecutionPolicy] = React.useState<OcrExecutionPolicy>(() => createOcrExecutionPolicy());
+ const runWorkflow = useOcrRunWorkflow({
+   documentFingerprint,
+   selectedPageIndexes,
+   pageCount,
+   pages,
+   pdfBytes,
+ });
```

Reason: `OcrPanel` was owning execution state, review UI, export, project restore, and diagnostics; this was the first real architectural split.

### KC-013 — hook-aware static cert contract

```diff
- assertContains(
-   'src/components/ocr/OcrPanel.tsx',
-   ['runFinalOcrIntegrationJob', 'OcrPipelineModePanel'],
-   'OCR_PANEL_USES_FINAL_INTEGRATION',
- );
+ assertContains(
+   'src/components/ocr/workflow/useOcrRunWorkflow.ts',
+   ['runFinalOcrIntegrationJob', 'runOcrPipeline', 'createOcrExecutionPlan', 'runOcrBatchScheduler', 'createOcrAbortControllerWithTimeout'],
+   'OCR_RUN_WORKFLOW_USES_FINAL_INTEGRATION',
+ );
```

Reason: the static contract must verify the new architecture, not prevent it.

### KC-014 — Unicode-escaped mojibake sentinels

```diff
- { pattern: '<literal mojibake apostrophe>', code: 'MOJIBAKE_APOSTROPHE' },
+ { pattern: '\u00E2\u20AC\u2122', code: 'MOJIBAKE_APOSTROPHE' },
+ { pattern: '\u00E2\u20AC\u0153', code: 'MOJIBAKE_OPEN_QUOTE' },
+ { pattern: '\u00E2\u20AC', code: 'MOJIBAKE_GENERAL' },
```

Reason: keeps the scan behavior while avoiding raw mojibake bytes in the script itself.

### KC-015 — retry failed batches `try/catch/finally`

```diff
  const controller = new AbortController();
  setLastBatchController(controller);

- await runOcrBatchScheduler({ ... });
- setLastBatchController(null);
+ try {
+   await runOcrBatchScheduler({ ... });
+ } catch (error) {
+   setErrorMessage(error instanceof Error ? error.message : 'OCR retry failed.');
+ } finally {
+   setLastBatchController(null);
+ }
```

Reason: retry failure must not leave stale cancellation state.

### KC-016 — document-aware complete state

```diff
+ const hasCurrentDocumentResult =
+   store.correctedResult?.documentFingerprint === effectiveDocumentFingerprint;
+
  const state: OcrRunWorkflowState = isRunning
    ? 'running'
    : errorMessage
      ? 'error'
-     : store.correctedResult
+     : hasCurrentDocumentResult
        ? 'complete'
        : requestedPageIndexes.length > 0
          ? 'ready'
          : 'idle';
```

Reason: OCR result from another document should not make current document appear complete.

### KC-017 — local patch-pack workaround, now superseded

```diff
+ PdfHub_Phase4_OCR_ReviewWorkspace_patch.zip
+ PdfHub_Phase4_with_knowncodeoptimisation.zip
```

Reason: earlier tool namespace exposed `3D_Viewer` for writes. This workaround is superseded by the successful `ocr-review-workspace-phase-4` branch push.

### KC-018 — review workspace extraction

```diff
+ import { OcrReviewWorkspace } from './workflow/OcrReviewWorkspace';
```

```diff
- <OcrReviewSection
-   resultSummary={...}
-   searchPanel={...}
-   correctionsPanel={...}
-   regionTools={...}
-   tableReview={...}
-   writerInsertion={...}
- />
+ <OcrReviewSection
+   resultSummary={
+     <OcrReviewWorkspace
+       documentFingerprint={runWorkflow.effectiveDocumentFingerprint}
+       selectedPages={runWorkflow.selectedPages}
+       pages={pages}
+       pdfBytes={pdfBytes}
+       writerInsertionQueue={writerInsertionQueue}
+       onWriterInsertionQueueChange={setWriterInsertionQueue}
+       onInsertWriterElements={onInsertWriterElements}
+     />
+   }
+ />
```

Reason: `OcrPanel` becomes a workflow coordinator; post-OCR review/use-result UX is moved to a dedicated workspace component.

## Known risks / follow-ups

1. `OcrReviewWorkspace` is still broad. A later phase should split `OcrRegionWorkspace`, `OcrTableReviewWorkspace`, and `OcrWriterInsertionWorkspace` if it keeps growing.
2. The static certification script is still string-marker based. Better future design: export a structured capability manifest or use focused unit tests instead of literal marker checks.
3. `OcrRunSection` still has the diagnostics auto-open effect workaround. Replace with derived controlled state on next touch.
4. OCR review tests currently cover baseline rendering and Writer queue insertion. Add user-flow tests for region creation/table acceptance when the test environment can reliably interact with region tool geometry.
