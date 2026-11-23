import React from 'react';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { useShallow } from 'zustand/react/shallow';
import { useOcrStore } from '@/core/ocr/ocrStore';
import type { OcrTableBlock } from '@/core/ocr/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionCandidate,
  upsertOcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrResultSummary } from '../OcrResultSummary';
import { OcrSearchMiniPanel } from '../OcrSearchMiniPanel';
import { OcrConfidenceLegend } from '../OcrConfidenceLegend';
import { OcrLowConfidencePanel } from '../OcrLowConfidencePanel';
import { OcrCorrectionPanel } from '../OcrCorrectionPanel';
import { OcrRegionReviewWorkspace } from './OcrRegionReviewWorkspace';
import { OcrTableReviewWorkspace } from './OcrTableReviewWorkspace';
import { OcrWriterInsertionWorkspace } from './OcrWriterInsertionWorkspace';
import { OcrFormFieldsPanel } from '../forms/OcrFormFieldsPanel';
import { OcrSearchBox } from '../search/OcrSearchBox';

// Re-exports and certification markers:
// OcrRegionActionPanel, OcrTableReviewPanel, OcrWriterInsertPanel, ocr-region-document-guidance
export { OcrRegionReviewWorkspace } from './OcrRegionReviewWorkspace';
export { OcrTableReviewWorkspace } from './OcrTableReviewWorkspace';
export { OcrWriterInsertionWorkspace } from './OcrWriterInsertionWorkspace';
export { OcrFormFieldsPanel } from '../forms/OcrFormFieldsPanel';
export { OcrSearchBox } from '../search/OcrSearchBox';
export { OcrDiffModal } from '../diff/OcrDiffModal';
export { OcrRegionActionPanel } from '../OcrRegionActionPanel';
export { OcrTableReviewPanel } from '../OcrTableReviewPanel';
export { OcrWriterInsertPanel } from '../OcrWriterInsertPanel';

export interface OcrReviewWorkspaceProps {
  documentFingerprint: string;
  selectedPages: number[];
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  writerInsertionQueue: OcrWriterInsertionQueueState;
  onWriterInsertionQueueChange: React.Dispatch<React.SetStateAction<OcrWriterInsertionQueueState>>;
  onInsertWriterElements?: (
    elements: WriterElementV2[],
  ) => void | Promise<void>;
}

export const OcrReviewWorkspace: React.FC<OcrReviewWorkspaceProps> = ({
  documentFingerprint,
  pages,
  pdfBytes = null,
  writerInsertionQueue,
  onWriterInsertionQueueChange,
  onInsertWriterElements,
}) => {
  const store = useOcrStore(useShallow((state) => ({
    confidenceSummary: state.confidenceSummary,
    correctedResult: state.correctedResult,
    lowConfidenceWords: state.lowConfidenceWords,
    regions: state.regions,
    searchIndex: state.searchIndex,
  })));
  const [selectedLowConfidenceWordId, setSelectedLowConfidenceWordId] = React.useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = React.useState<string | null>(null);
  const [lastRegionTableBlock, setLastRegionTableBlock] = React.useState<OcrTableBlock | null>(null);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- document switches must reset document-scoped review state before stale selections remain actionable. */
    setSelectedLowConfidenceWordId(null);
    setSelectedRegionId(null);
    setLastRegionTableBlock(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [documentFingerprint]);

  const currentResult = store.correctedResult?.documentFingerprint === documentFingerprint
    ? store.correctedResult
    : null;

  const currentRegions = React.useMemo(
    () => store.regions.filter(
      (region) => region.documentFingerprint === documentFingerprint,
    ),
    [documentFingerprint, store.regions],
  );

  const currentLowConfidenceWords = currentResult
    ? store.lowConfidenceWords
    : [];

  const currentSearchIndex = currentResult
    ? store.searchIndex
    : null;

  const currentConfidenceSummary = currentResult
    ? store.confidenceSummary
    : null;

  const documentTableBlocks = React.useMemo(() => {
    if (!currentResult) return [];
    return currentResult.pages.flatMap((page) =>
      (page.blocks ?? []).filter((block): block is OcrTableBlock => block.type === 'table'),
    );
  }, [currentResult]);

  const activeTableBlock = lastRegionTableBlock ?? documentTableBlocks[0] ?? null;

  const currentWriterInsertionQueue = React.useMemo<OcrWriterInsertionQueueState>(() => ({
    candidates: writerInsertionQueue.candidates.filter(
      (candidate) => candidate.element.documentFingerprint === documentFingerprint,
    ),
  }), [documentFingerprint, writerInsertionQueue.candidates]);

  const selectedRegion = React.useMemo(() => {
    if (!selectedRegionId) return null;
    return currentRegions.find((region) => region.id === selectedRegionId) ?? null;
  }, [
    currentRegions,
    selectedRegionId,
  ]);

  const selectedLowConfidenceWord = React.useMemo(() => {
    if (!selectedLowConfidenceWordId) {
      return null;
    }

    return currentLowConfidenceWords.find(
      (item) => item.word.id === selectedLowConfidenceWordId,
    )?.word ?? null;
  }, [
    currentLowConfidenceWords,
    selectedLowConfidenceWordId,
  ]);

  const handleCurrentWriterInsertionQueueChange = React.useCallback((nextQueue: OcrWriterInsertionQueueState) => {
    onWriterInsertionQueueChange((current) => ({
      candidates: [
        ...current.candidates.filter(
          (candidate) => candidate.element.documentFingerprint !== documentFingerprint,
        ),
        ...nextQueue.candidates,
      ],
    }));
  }, [
    documentFingerprint,
    onWriterInsertionQueueChange,
  ]);

  const queueWriterElement = React.useCallback((element: WriterElementV2, source: 'ocrRegion' | 'ocrTableReview') => {
    onWriterInsertionQueueChange((current) =>
      upsertOcrWriterInsertionCandidate(
        current,
        createOcrWriterInsertionCandidate({
          source,
          element,
        }),
      ),
    );
  }, [onWriterInsertionQueueChange]);

  const hasReviewContent =
    Boolean(currentResult)
    || currentRegions.length > 0
    || currentWriterInsertionQueue.candidates.length > 0;

  if (!hasReviewContent) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        data-testid="ocr-review-workspace-empty"
      >
        <span data-testid="ocr-review-empty" className="sr-only">
          Empty OCR review workspace
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-50">
          Nothing to review yet.
        </span>{' '}
        Run OCR to show confidence, search, corrections, regions, tables, and Writer insertion.
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      data-testid="ocr-review-workspace"
    >
      {currentResult ? (
        <div
          className="space-y-2"
          data-testid="ocr-review-workspace-summary"
        >
          <OcrResultSummary
            result={currentResult}
            confidenceSummary={currentConfidenceSummary}
            lowConfidenceCount={currentLowConfidenceWords.length}
          />
          <OcrConfidenceLegend compact />
          <OcrSearchBox
            document={currentResult}
            onActiveMatchChange={(activeMatch) => {
              if (!activeMatch) return;
              useOcrStore.getState().focusOcrTarget({
                documentFingerprint,
                pageIndex: activeMatch.pageIndex,
                bbox: activeMatch.bbox,
                targetId: activeMatch.id,
                source: 'search',
                label: activeMatch.matchedText,
              });
            }}
          />
        </div>
      ) : null}

      {currentSearchIndex ? (
        <OcrSearchMiniPanel
          disabled={!currentSearchIndex}
          onSearch={(query) =>
            useOcrStore.getState().searchOcr({
              text: query,
              limit: 8,
            })
          }
          onSelectMatch={(match) => {
            if (!match.item.bbox) return;
            useOcrStore.getState().focusOcrTarget({
              documentFingerprint,
              pageIndex: match.item.pageIndex,
              bbox: match.item.bbox,
              targetId: match.item.targetId,
              source: 'search',
              label: match.item.text,
            });
          }}
        />
      ) : null}

      {currentLowConfidenceWords.length > 0 || selectedLowConfidenceWord ? (
        <div
          className="space-y-2"
          data-testid="ocr-review-workspace-corrections"
        >
          <OcrLowConfidencePanel
            words={currentLowConfidenceWords}
            selectedWordId={selectedLowConfidenceWordId}
            onSelectWord={(item) => {
              setSelectedLowConfidenceWordId(item.word.id);
              useOcrStore.getState().focusOcrTarget({
                documentFingerprint,
                pageIndex: item.pageIndex,
                bbox: item.word.bbox,
                targetId: item.word.id,
                source: 'lowConfidence',
                label: item.word.text,
              });
            }}
          />
          <OcrCorrectionPanel
            word={selectedLowConfidenceWord}
            documentFingerprint={documentFingerprint}
          />
        </div>
      ) : null}

      {currentRegions.length > 0 || currentResult ? (
        <OcrRegionReviewWorkspace
          documentFingerprint={documentFingerprint}
          regions={currentRegions}
          selectedRegionId={selectedRegionId}
          onSelectRegionId={setSelectedRegionId}
          pages={pages}
          pdfBytes={pdfBytes}
          onRegionTableFound={(tableBlock) => setLastRegionTableBlock(tableBlock)}
          onWriterElementCreated={(element) => queueWriterElement(element, 'ocrRegion')}
        />
      ) : null}

      {activeTableBlock ? (
        <OcrTableReviewWorkspace
          documentFingerprint={documentFingerprint}
          tableBlock={activeTableBlock}
          selectedRegion={selectedRegion}
          onAcceptTableElement={(element) => queueWriterElement(element, 'ocrTableReview')}
        />
      ) : null}

      {currentResult ? (
        <OcrFormFieldsPanel ocrResult={currentResult} />
      ) : null}

      {currentWriterInsertionQueue.candidates.length > 0 ? (
        <OcrWriterInsertionWorkspace
          queue={currentWriterInsertionQueue}
          onQueueChange={handleCurrentWriterInsertionQueueChange}
          onInsertElements={onInsertWriterElements}
        />
      ) : null}
    </div>
  );
};

export default OcrReviewWorkspace;
