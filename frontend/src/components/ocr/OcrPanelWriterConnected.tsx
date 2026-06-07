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
import { OcrSourceSummaryCard } from './OcrSourceSummaryCard';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { hydrateOcrStoreFromProjectPayload } from '@/core/ocr/ocrHydrationBridge';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import { Workflow } from 'lucide-react';

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
      className="flex h-full flex-col overflow-auto bg-slate-50 dark:bg-slate-950"
      data-testid="ocr-panel-writer-connected"
    >
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Workflow className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  OCR Assistant
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Run OCR, review the result, then export or send clean content to Writer.
                </p>
              </div>

              <div
                className={[
                  'shrink-0 rounded-xl border px-2.5 py-2 text-xs shadow-sm',
                  summary.hasPdfBytes
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
                ].join(' ')}
                data-testid="ocr-guidance-card"
              >
                <div className="font-semibold">
                  {summary.hasPdfBytes ? 'Ready for OCR' : 'Open a PDF first'}
                </div>
                <div className="mt-0.5 max-w-[240px] truncate opacity-90">
                  {summary.hasPdfBytes
                    ? `${summary.selectedPageCount || 'All'} selected page(s).`
                    : 'Load a PDF to extract text.'}
                </div>
              </div>
            </div>

            <div
              className="mt-2 flex flex-wrap gap-1.5"
              data-testid="ocr-unified-summary"
            >
              <SummaryPill
                label="PDF"
                value={summary.hasPdfBytes ? summary.bytesSource : 'missing'}
                tone={summary.hasPdfBytes ? 'success' : 'warning'}
              />
              <SummaryPill
                label="Pages"
                value={summary.pageCount || 0}
              />
              <SummaryPill
                label="Selected"
                value={summary.selectedPageCount || 'all'}
              />
              <SummaryPill
                label="Document"
                value={summary.fileName ?? summary.documentFingerprint ?? 'none'}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-3 p-3">
        {lastInsertSummary ? (
          <div
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
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
        />

        <section
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          data-testid="ocr-connected-source"
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Source
          </div>

          <div className="space-y-2">
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
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
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
        </section>
      </div>
    </div>
  );
};

function SummaryPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm',
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
          : tone === 'warning'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
      ].join(' ')}
      title={`${label}: ${value}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="max-w-[160px] truncate font-semibold">
        {value}
      </span>
    </span>
  );
}

export default OcrPanelWriterConnected;
