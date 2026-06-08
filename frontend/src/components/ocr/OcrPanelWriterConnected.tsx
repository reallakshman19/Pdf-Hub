import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { createOcrWriterInsertionCandidate, createOcrWriterInsertionQueue } from '@/core/ocr/ocrWriterInsertion';
import { createOcrWriterBridgeDiagnosticsSummary, insertOcrWriterQueueIntoWriterV2Store } from '@/core/ocr/ocrWriterBridge';
import { getOcrPdfSourceFromSessionState, createOcrPdfSourceSummary } from '@/core/ocr/ocrPdfSourceBridge';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { OcrPanel } from './OcrPanel';
import { OcrDemoFixturePanel } from './OcrDemoFixturePanel';
import { OcrSourceSummaryCard } from './OcrSourceSummaryCard';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { hydrateOcrStoreFromProjectPayload } from '@/core/ocr/ocrHydrationBridge';
import type { OcrProjectPayloadV1 } from '@/core/ocr/ocrProjectCodec';
import { OcrAssistantShell } from './workflow/OcrAssistantShell';
import { OcrHeaderSummary } from './workflow/OcrHeaderSummary';

// Static check markers: ocr-pdf-source-summary, ocr-assistant-shell, ocr-header-summary

export interface OcrPanelWriterConnectedProps {
  documentFingerprint?: string | null;
  selectedPageIndexes?: number[];
  pageCount?: number;
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  onSearchablePdfExported?: (bytes: Uint8Array) => void;
}

type OcrConnectedSummary = ReturnType<typeof createOcrPdfSourceSummary>;

export const OcrPanelWriterConnected: React.FC<OcrPanelWriterConnectedProps> = (props) => {
  const writerDocumentFingerprint = useWriterV2Store((state) => state.currentDocumentFingerprint);
  const documentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);
  const originalBytes = useSessionStore((state) => state.originalBytes);
  const workingBytes = useSessionStore((state) => state.workingBytes);
  const sessionPageCount = useSessionStore((state) => state.pageCount);
  const selectedPages = useSessionStore((state) => state.selectedPages);

  const ocrPdfSource = React.useMemo(() => getOcrPdfSourceFromSessionState({
    documentKey,
    fileName,
    originalBytes,
    workingBytes,
    pageCount: sessionPageCount,
    selectedPages,
  }), [documentKey, fileName, originalBytes, workingBytes, sessionPageCount, selectedPages]);

  const sessionSummary = createOcrPdfSourceSummary(ocrPdfSource);
  const [demoPdfBytes, setDemoPdfBytes] = React.useState<Uint8Array | null>(null);
  const [demoDocumentFingerprint, setDemoDocumentFingerprint] = React.useState<string | null>(null);
  const [demoPageCount, setDemoPageCount] = React.useState<number | null>(null);
  const [demoProjectPayload, setDemoProjectPayload] = React.useState<OcrProjectPayloadV1 | null>(null);
  const [lastInsertSummary, setLastInsertSummary] = React.useState<string | null>(null);

  const effectiveDocumentFingerprint = props.documentFingerprint ?? demoDocumentFingerprint ?? ocrPdfSource.documentFingerprint ?? writerDocumentFingerprint ?? 'ocr-writer-document';
  const effectivePdfBytes = props.pdfBytes ?? demoPdfBytes ?? ocrPdfSource.pdfBytes;
  const effectiveSelectedPageIndexes = props.selectedPageIndexes ?? ocrPdfSource.selectedPageIndexes;
  const effectivePageCount = props.pageCount ?? demoPageCount ?? ocrPdfSource.pageCount ?? 1;
  const effectiveHasPdfBytes = Boolean(effectivePdfBytes);
  const effectiveSelectedPageCount = effectiveSelectedPageIndexes.length;

  const headerSummary: OcrConnectedSummary = {
    fileName: sessionSummary.fileName ?? (demoPdfBytes ? 'Demo OCR fixture' : null),
    documentFingerprint: effectiveDocumentFingerprint,
    hasPdfBytes: effectiveHasPdfBytes,
    bytesSource: props.pdfBytes ? 'direct input' : demoPdfBytes ? 'demo fixture' : sessionSummary.bytesSource,
    pageCount: effectivePageCount,
    selectedPageCount: effectiveSelectedPageCount,
  };

  const insertIntoWriter = React.useCallback((elements: WriterElementV2[]) => {
    const queue = createOcrWriterInsertionQueue(elements.map((element) => createOcrWriterInsertionCandidate({ source: 'ocrRegion', element })));
    const result = insertOcrWriterQueueIntoWriterV2Store({ queue, documentFingerprint: effectiveDocumentFingerprint, selectAll: true });
    const diagnostics = createOcrWriterBridgeDiagnosticsSummary(result.diagnostics);
    const prefix = result.commandApplied ? `Inserted ${result.insertedElements.length}` : 'Inserted 0';
    setLastInsertSummary(`${prefix} Writer element(s). Diagnostics: ${diagnostics.errors} error(s), ${diagnostics.warnings} warning(s).`);
  }, [effectiveDocumentFingerprint]);

  const sourceWarnings = props.pdfBytes || demoPdfBytes
    ? []
    : ocrPdfSource.diagnostics.filter((diagnostic) => diagnostic.level !== 'info');

  return (
    <div data-testid="ocr-panel-writer-connected" className="h-full">
      <OcrAssistantShell
        header={<OcrHeaderSummary fileName={headerSummary.fileName} documentFingerprint={headerSummary.documentFingerprint} hasPdfBytes={headerSummary.hasPdfBytes} bytesSource={headerSummary.bytesSource} pageCount={headerSummary.pageCount} selectedPageCount={headerSummary.selectedPageCount} />}
        writerStatus={lastInsertSummary ? <WriterStatus message={lastInsertSummary} /> : null}
        main={<OcrPanel documentFingerprint={effectiveDocumentFingerprint} selectedPageIndexes={effectiveSelectedPageIndexes} pageCount={effectivePageCount} pages={props.pages} pdfBytes={effectivePdfBytes} onSearchablePdfExported={props.onSearchablePdfExported} onInsertWriterElements={insertIntoWriter} projectPayload={demoProjectPayload} />}
        sourceDefaultOpen={!headerSummary.hasPdfBytes || sourceWarnings.length > 0}
        sourceDetails={<SourceDetails summary={headerSummary} warnings={sourceWarnings.map((item) => item.message)} />}
        advancedDetails={<DemoFixtures onLoaded={(fixture) => {
          setDemoPdfBytes(fixture.pdfBytes);
          setDemoDocumentFingerprint(fixture.documentFingerprint);
          setDemoPageCount(fixture.descriptor.pageCount);
          setDemoProjectPayload(fixture.projectPayload);
          hydrateOcrStoreFromProjectPayload({ payload: fixture.projectPayload, expectedDocumentFingerprint: fixture.documentFingerprint, store: useOcrStore.getState() });
        }} />}
      />
    </div>
  );
};

function WriterStatus({ message }: { message: string }) {
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" data-testid="ocr-writer-connected-summary"><span className="font-semibold">Writer updated. </span>{message}</div>;
}

function SourceDetails({ summary, warnings }: { summary: OcrConnectedSummary; warnings: string[] }) {
  return <section data-testid="ocr-connected-source" className="space-y-2"><OcrSourceSummaryCard fileName={summary.fileName} documentFingerprint={summary.documentFingerprint} hasPdfBytes={summary.hasPdfBytes} bytesSource={summary.bytesSource} pageCount={summary.pageCount} selectedPageCount={summary.selectedPageCount} />{warnings.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="ocr-pdf-source-warning">{warnings.join(' ')}</div> : null}</section>;
}

function DemoFixtures({ onLoaded }: { onLoaded: React.ComponentProps<typeof OcrDemoFixturePanel>['onFixtureLoaded'] }) {
  return <section className="space-y-2" data-testid="ocr-demo-fixtures"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Demo / QA fixtures</div><OcrDemoFixturePanel onFixtureLoaded={onLoaded} /></section>;
}

export default OcrPanelWriterConnected;
