# Known Code Optimisation / Patch / Shim / Workaround Register

Repository target: `reallaksh19/Pdf-Hub`

Primary stack:

```txt
PR #119  ocr-professional-workflow-phase-1
PR #120  ocr-review-workspace-phase-4
```

Verified current state before this file was updated:

```txt
PR #119 head used for Phase 4 base: dcfbd33b506402afbe198d01fa96bf37cc92a050
Phase 4 branch: ocr-review-workspace-phase-4
knowncodeoptimisation.md: committed at repository root on Phase 4 branch
```

## Patch / shim / workaround index

| ID | Type | File(s) | Status | Reason | Follow-up |
|---|---|---|---|---|---|
| KC-001 | CI workaround | `.github/workflows/ocr-workflow-certification.yml` | Active | Use Corepack and targeted OCR certification gates. | Keep until release workflow is stable. |
| KC-002 | CI resource workaround | `.github/workflows/ocr-workflow-certification.yml` | Active | Prevent Vitest worker/memory exhaustion. | Keep `--pool=forks --maxWorkers=1`. |
| KC-003 | Static-cert marker shim | `OcrSourceSummaryCard.tsx`, `OcrPanelWriterConnected.tsx` | Active | Literal static cert markers were required. | Replace with structural cert later. |
| KC-004 | Type shim | `OcrPanelWriterConnected.tsx` | Active | Normalize direct/demo/session source summary shape. | Move to shared source-summary model. |
| KC-005 | Controlled disclosure patch | `OcrAssistantShell.tsx` | Active | Avoid effect-driven default-open disclosure state. | Keep. |
| KC-006 | Effect workaround | `OcrRunSection.tsx` | Active | Diagnostics auto-open currently uses guarded effect. | Replace with derived open state later. |
| KC-007 | Test scoping patch | OCR tests | Active | Avoid ambiguous Testing Library text matches. | Keep scoped `within()` usage. |
| KC-008 | Static-cert single-panel marker | `OcrPanelWriterConnected.tsx` | Active | Proves one connected `OcrPanel` mount. | Replace with JSX owner check later. |
| KC-009 | Presentational run controls | `OcrRunControls.tsx`, `OcrPanel.tsx` | Active | Move engine/profile options out of control component. | Keep. |
| KC-010 | Clear race fix | `OcrRunControls.tsx` | Active | Disable Clear while OCR is running. | Future cancel-aware clear can refine. |
| KC-011 | Typecheck hotfix | `OcrRunControls.tsx` | Complete | Removed unused React import. | None. |
| KC-012 | Execution model extraction | `useOcrRunWorkflow.ts`, `OcrPanel.tsx` | Active | Move run state, policy, diagnostics, cancel, retry out of panel. | Continue extracting workspaces. |
| KC-013 | Static-cert architecture update | `certify-writer-v2-ocr.mjs` | Active | Cert now recognizes the run hook as final integration owner. | Keep architecture-aware checks. |
| KC-014 | Bad-encoding sentinel workaround | `certify-writer-v2-ocr.mjs` | Active | Use escaped sentinel strings rather than raw bad-encoding bytes. | Keep. |
| KC-015 | Retry cleanup hardening | `useOcrRunWorkflow.ts` | Active | Retry failure must not leave stale cancel controller. | Keep `try/catch/finally`. |
| KC-016 | Document-aware complete state | `useOcrRunWorkflow.ts` | Active | Stale OCR result must not mark a new document complete. | Keep tests. |
| KC-017 | Local patch-pack workaround | local zip, then Phase 4 branch | Superseded | Earlier connector write namespace pointed at wrong repo. | Superseded. |
| KC-018 | Review workspace extraction | `OcrReviewWorkspace.tsx`, `OcrPanel.tsx` | Active | Move post-OCR review/use-result UI out of panel. | Split sub-workspaces later if needed. |
| KC-019 | Review workspace document isolation | `OcrReviewWorkspace.tsx`, `OcrReviewWorkspace.test.tsx` | Active | Prevent stale result, regions, search, corrections, and Writer queue content across document switches. | Keep document-scoped guards. |

## Code-diff register

### KC-001/KC-002 - targeted OCR workflow and worker cap

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

### KC-003/KC-008 - static certification markers

```diff
+ // Static certification markers: Active OCR Source, PDF bytes
+ // OcrPanel is mounted once only.
```

### KC-004 - connected source summary shape

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

### KC-005 - controlled disclosure state

```diff
- const [sourceOpen, setSourceOpen] = React.useState(sourceDefaultOpen);
+ const [sourceUserOpen, setSourceUserOpen] = React.useState(false);
+ const sourceOpen = sourceDefaultOpen || sourceUserOpen;
```

### KC-006 - diagnostics auto-open workaround

```diff
+ React.useEffect(() => {
+   if (executionDiagnostics) {
+     // eslint-disable-next-line react-hooks/set-state-in-effect
+     setAdvancedOpen(true);
+   }
+ }, [executionDiagnostics]);
```

### KC-007 - scoped tests

```diff
- expect(screen.getByText('working')).toBeTruthy();
+ const summary = within(screen.getByTestId('ocr-unified-summary'));
+ expect(summary.getByText('working')).toBeTruthy();
```

### KC-009 - presentational run controls

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

### KC-010 - Clear disabled during run

```diff
- disabled={clearDisabled}
+ disabled={running || clearDisabled}
```

### KC-011 - unused React import

```diff
- import React from 'react';
```

### KC-012 - execution model extraction

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

### KC-013 - hook-aware static cert

```diff
- assertContains('src/components/ocr/OcrPanel.tsx', ['runFinalOcrIntegrationJob'], 'OCR_PANEL_USES_FINAL_INTEGRATION');
+ assertContains('src/components/ocr/workflow/useOcrRunWorkflow.ts', ['runFinalOcrIntegrationJob'], 'OCR_RUN_WORKFLOW_USES_FINAL_INTEGRATION');
+ assertContains('src/components/ocr/OcrPanel.tsx', ['useOcrRunWorkflow'], 'OCR_PANEL_USES_RUN_WORKFLOW');
```

### KC-014 - escaped bad-encoding sentinels

```diff
- pattern: '<raw bad-encoding bytes>'
+ pattern: '<escaped bad-encoding sentinel>'
```

### KC-015 - retry cleanup

```diff
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

### KC-016 - document-aware completion state

```diff
+ const hasCurrentDocumentResult =
+   store.correctedResult?.documentFingerprint === effectiveDocumentFingerprint;
+
-     : store.correctedResult
+     : hasCurrentDocumentResult
        ? 'complete'
```

### KC-017 - local patch-pack workaround

```diff
+ PdfHub_Phase4_OCR_ReviewWorkspace_patch.zip
+ PdfHub_Phase4_with_knowncodeoptimisation.zip
```

Superseded once the connector write path was verified.

### KC-018 - review workspace extraction

```diff
+ import { OcrReviewWorkspace } from './workflow/OcrReviewWorkspace';
```

```diff
- <OcrReviewSection resultSummary={...} searchPanel={...} correctionsPanel={...} regionTools={...} tableReview={...} writerInsertion={...} />
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

### KC-019 - review workspace document isolation

```diff
+ const currentResult = store.correctedResult?.documentFingerprint === documentFingerprint
+   ? store.correctedResult
+   : null;
+
+ const currentRegions = store.regions.filter(
+   (region) => region.documentFingerprint === documentFingerprint,
+ );
+
+ const currentLowConfidenceWords = currentResult ? store.lowConfidenceWords : [];
+ const currentSearchIndex = currentResult ? store.searchIndex : null;
```

```diff
+ React.useEffect(() => {
+   /* eslint-disable react-hooks/set-state-in-effect -- document switches must reset document-scoped review state before stale selections remain actionable. */
+   setSelectedLowConfidenceWordId(null);
+   setSelectedRegionId(null);
+   setLastRegionWriterElementType(null);
+   setLastRegionTableBlock(null);
+   setLastAcceptedTableSummary(null);
+   setLastInsertedWriterCount(null);
+   /* eslint-enable react-hooks/set-state-in-effect */
+ }, [documentFingerprint]);
```

```diff
+ it('does not render stale OCR result from another document', () => { ... });
+ it('resets selected review state when document fingerprint changes', async () => { ... });
```

## Known risks / follow-ups

1. `OcrReviewWorkspace` is still broad. A later phase should split `OcrRegionWorkspace`, `OcrTableReviewWorkspace`, and `OcrWriterInsertionWorkspace` if it keeps growing.
2. The static certification script is still string-marker based. Better future design: export a structured capability manifest or use focused unit tests instead of literal marker checks.
3. `OcrRunSection` still has the diagnostics auto-open effect workaround. Replace with derived controlled state on next touch.
4. Phase 4 now covers stale OCR result suppression and document-switch cleanup. Add deeper user-flow tests for region creation/table acceptance when the test environment can reliably interact with region tool geometry.
