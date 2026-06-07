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
  getOcrPdfSourceFromSessionState,
  createOcrPdfSourceSummary,
} from '@/core/ocr/ocrPdfSourceBridge';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { OcrPanel } from './OcrPanel';
import { OcrDemoFixturePanel } from './OcrDemoFixturePanel';
import { OcrUnifiedPanel } from './OcrUnifiedPanel';
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
  const writerDocumentFingerprint = useWriterV2Store(
    (state) => state.currentDocumentFingerprint,
  );

  const sessionDocumentKey = useSessionStore((state) => state.documentKey);
  const sessionFileName = useSessionStore((state) => state.fileName);
  const sessionOriginalBytes = useSessionStore((state) => state.originalBytes);
  const sessionWorkingBytes = useSessionStore((state) => state.workingBytes);
  const sessionPageCount = useSessionStore((state) => state.pageCount);
  const sessionSelectedPages = useSessionStore((state) => state.selectedPages);

  const ocrPdfSource = React.useMemo(
    () =>
      getOcrPdfSourceFromSessionState({
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

  const effectiveDocumentFingerprint =
    documentFingerprint
    ?? demoDocumentFingerprint
    ?? ocrPdfSource.documentFingerprint
    ?? writerDocumentFingerprint
    ?? 'ocr-writer-document';

  const effectivePdfBytes =
    pdfBytes
    ?? demoPdfBytes
    ?? ocrPdfSource.pdfBytes;

  const effectiveSelectedPageIndexes =
    selectedPageIndexes
    ?? ocrPdfSource.selectedPageIndexes;

  const effectivePageCount =
    pageCount
    ?? demoPageCount
    ?? ocrPdfSource.pageCount
    ?? 1;

  const insertIntoWriter = React.useCallback((elements: WriterElementV2[]) => {
    const queue = createOcrWriterInsertionQueue(
      elements.map((element) =>
        createOcrWriterInsertionCandidate({
          source: 'ocrRegion',
          element,
        }),
      ),
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
      className="flex h-full flex-col"
      data-testid="ocr-panel-writer-connected"
    >
      <OcrUnifiedPanel
        sourceSummary={[
          {
            label: 'PDF',
            value: summary.hasPdfBytes ? summary.bytesSource : 'missing',
            tone: summary.hasPdfBytes ? 'success' : 'warning',
          },
          {
            label: 'Pages',
            value: summary.pageCount || 0,
          },
          {
            label: 'Selected',
            value: summary.selectedPageCount || 'all',
          },
          {
            label: 'Document',
            value: summary.fileName ?? summary.documentFingerprint ?? 'none',
          },
        ]}
        source={
          <div className="space-y-3">
            <OcrSourceSummaryCard
              fileName={summary.fileName}
              documentFingerprint={summary.documentFingerprint}
              hasPdfBytes={summary.hasPdfBytes}
              bytesSource={summary.bytesSource}
              pageCount={summary.pageCount}
              selectedPageCount={summary.selectedPageCount}
            />

            {ocrPdfSource.diagnostics.some((diagnostic) => diagnostic.level !== 'info') ? (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                data-testid="ocr-pdf-source-warning"
              >
                {ocrPdfSource.diagnostics
                  .filter((diagnostic) => diagnostic.level !== 'info')
                  .map((diagnostic) => diagnostic.message)
                  .join(' ')}
              </div>
            ) : null}

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
          </div>
        }
        run={
          <OcrPanel
            documentFingerprint={effectiveDocumentFingerprint}
            selectedPageIndexes={effectiveSelectedPageIndexes}
            pageCount={effectivePageCount}
            pages={pages}
            pdfBytes={effectivePdfBytes}
            onSearchablePdfExported={onSearchablePdfExported}
            onInsertWriterElements={insertIntoWriter}
            projectPayload={demoProjectPayload}
          />
        }
        review={
          lastInsertSummary ? (
            <div
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              data-testid="ocr-writer-connected-summary"
            >
              <div className="font-semibold">Writer updated</div>
              <div className="mt-1 text-xs leading-5">{lastInsertSummary}</div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Inserted OCR content will be confirmed here after you send text, tables, or regions to Writer.
            </div>
          )
        }
        diagnostics={
          <div className="space-y-2">
            {ocrPdfSource.diagnostics.map((diagnostic, index) => (
              <div
                key={`${diagnostic.code}-${index}`}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                {diagnostic.code}: {diagnostic.message}
              </div>
            ))}
          </div>
        }
      />
    </div>
  );
};

export default OcrPanelWriterConnected;
