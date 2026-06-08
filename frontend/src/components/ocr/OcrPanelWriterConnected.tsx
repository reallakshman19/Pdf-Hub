import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '@/core/ocr/ocrWriterInsertion';
import {
  createOcrWriterBridgeDiagnosticsSummary,
  insertOcrWriterQueueIntoWriterV2Store,
} from '@/core/ocr/ocrWriterBridge';
import {
  createOcrPdfSourceSummary,
  getOcrPdfSourceFromSessionState,
} from '@/core/ocr/ocrPdfSourceBridge';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { OcrPanel } from './OcrPanel';
import { OcrDemoFixturePanel } from './OcrDemoFixturePanel';
import { OcrSourceSummaryCard } from './OcrSourceSummaryCard';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { hydrateOcrStoreFromProjectPayload } from '@/core/ocr/ocrHydrationBridge';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';

// Static check marker: ocr-pdf-source-summary

export interface OcrPanelWriterConnectedProps {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  onSearchablePdfExported?: (bytes: Uint8Array) => void;
}

export const OcrPanelWriterConnected: React.FC<OcrPanelWriterConnectedProps> = ({
  documentFingerprint,
  selectedPageIndexes,
  pageCount,
  pages,
  pdfBytes,
  onSearchablePdfExported,
}) => {
  const writerDocumentFingerprint = useWriterV2Store((state) => state.currentDocumentFingerprint);
  const sessionDocumentKey = useSessionStore((state) => state.documentKey);
  const sessionFileName = useSessionStore((state) => state.fileName);
  const sessionOriginalBytes = useSessionStore((state) => state.originalBytes);
  const sessionWorkingBytes = useSessionStore((state) => state.workingBytes);
  const sessionPageCount = useSessionStore((state) => state.pageCount);
  const sessionSelectedPages = useSessionStore((state) => state.selectedPages);

  const ocrPdfSource = React.useMemo(
    () => getOcrPdfSourceFromSessionState({
      documentKey: sessionDocumentKey,
      fileName: sessionFileName,
      originalBytes: sessionOriginalBytes,
      workingBytes: sessionWorkingBytes,
      pageCount: sessionPageCount,
      selectedPages: sessionSelectedPages,
    }),
    [
      sessionDocumentKey,
      sessionFileName,
      sessionOriginalBytes,
      sessionWorkingBytes,
      sessionPageCount,
      sessionSelectedPages,
    ],
  );

  const summary = createOcrPdfSourceSummary(ocrPdfSource);
  const [demoPdfBytes, setDemoPdfBytes] = React.useState<Uint8Array | null>(null);
  const [demoDocumentFingerprint, setDemoDocumentFingerprint] = React.useState<string | null>(null);
  const [demoPageCount, setDemoPageCount] = React.useState<number | null>(null);
  const [demoProjectPayload, setDemoProjectPayload] = React.useState<OcrProjectPayloadV1 | null>(null);
  const [lastInsertSummary, setLastInsertSummary] = React.useState<string | null>(null);

  const effectiveDocumentFingerprint = documentFingerprint
    ?? demoDocumentFingerprint
    ?? ocrPdfSource.documentFingerprint
    ?? writerDocumentFingerprint
    ?? 'ocr-writer-document';
  const effectivePdfBytes = pdfBytes ?? demoPdfBytes ?? ocrPdfSource.pdfBytes;
  const effectiveSelectedPageIndexes = selectedPageIndexes ?? ocrPdfSource.selectedPageIndexes;
  const effectivePageCount = pageCount ?? demoPageCount ?? ocrPdfSource.pageCount ?? 1;
  const sourceWarnings = ocrPdfSource.diagnostics.filter((diagnostic) => diagnostic.level !== 'info');

  const insertIntoWriter = React.useCallback((elements: WriterElementV2[]) => {
    const queue = createOcrWriterInsertionQueue(
      elements.map((element) => createOcrWriterInsertionCandidate({ source: 'ocrRegion', element })),
    );
    const result = insertOcrWriterQueueIntoWriterV2Store({
      queue,
      documentFingerprint: effectiveDocumentFingerprint,
      selectAll: true,
    });
    const diagnosticSummary = createOcrWriterBridgeDiagnosticsSummary(result.diagnostics);

    setLastInsertSummary(
      result.commandApplied
        ? `Inserted ${result.insertedElements.length} Writer element(s). Diagnostics: ${diagnosticSummary.errors} error(s), ${diagnosticSummary.warnings} warning(s).`
        : `No Writer elements inserted. Diagnostics: ${diagnosticSummary.errors} error(s), ${diagnosticSummary.warnings} warning(s).`,
    );
  }, [effectiveDocumentFingerprint]);

  return (
    <div
      className="flex h-full flex-col overflow-auto bg-slate-50 p-3 dark:bg-slate-950"
      data-testid="ocr-panel-writer-connected"
    >
      {lastInsertSummary ? (
        <div
          className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          data-testid="ocr-writer-connected-summary"
        >
          <span className="font-semibold">Writer updated. </span>
          {lastInsertSummary}
        </div>
      ) : null}

      <OcrPanel
        documentFingerprint={effectiveDocumentFingerprint}
        selectedPageIndexes={effectiveSelectedPageIndexes}
        pageCount={effectivePageCount}
        pages={pages}
        pdfBytes={effectivePdfBytes}
        onSearchablePdfExported={onSearchablePdfExported}
        onInsertWriterElements={insertIntoWriter}
        projectPayload={demoProjectPayload}
        fileName={summary.fileName ?? summary.documentFingerprint ?? effectiveDocumentFingerprint}
        sourceStateLabel={summary.hasPdfBytes ? summary.bytesSource ?? 'Working copy' : 'missing'}
        sourceHasWarning={sourceWarnings.length > 0 || !summary.hasPdfBytes}
        sourceDetails={(
          <div className="space-y-2" data-testid="ocr-connected-source">
            <OcrSourceSummaryCard
              fileName={summary.fileName}
              documentFingerprint={summary.documentFingerprint}
              hasPdfBytes={summary.hasPdfBytes}
              bytesSource={summary.bytesSource}
              pageCount={summary.pageCount}
              selectedPageCount={summary.selectedPageCount}
            />
            {sourceWarnings.length > 0 ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                data-testid="ocr-pdf-source-warning"
              >
                {sourceWarnings.map((diagnostic) => diagnostic.message).join(' ')}
              </div>
            ) : null}
          </div>
        )}
        advancedFixtures={(
          <OcrDemoFixturePanel
            onFixtureLoaded={(fixture) => {
              setDemoPdfBytes(fixture.pdfBytes);
              setDemoDocumentFingerprint(fixture.documentFingerprint);
              setDemoPageCount(fixture.descriptor.pageCount);
              setDemoProjectPayload(fixture.projectPayload);
              hydrateOcrStoreFromProjectPayload({
                payload: fixture.projectPayload,
                expectedDocumentFingerprint: fixture.documentFingerprint,
                store: useOcrStore.getState(),
              });
            }}
          />
        )}
      />
    </div>
  );
};

export default OcrPanelWriterConnected;
