import React from 'react';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import { useShallow } from 'zustand/react/shallow';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  resolveOcrRegionPageInput,
} from '@/core/ocr/ocrRegionRasterBridge';
import type { OcrTableBlock } from '@/core/ocr/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionCandidate,
  createReviewedOcrTableWriterElement,
  upsertOcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrResultSummary } from '../OcrResultSummary';
import { OcrSearchMiniPanel } from '../OcrSearchMiniPanel';
import { OcrConfidenceLegend } from '../OcrConfidenceLegend';
import { OcrLowConfidencePanel } from '../OcrLowConfidencePanel';
import { OcrCorrectionPanel } from '../OcrCorrectionPanel';
import { OcrRegionListPanel } from '../OcrRegionListPanel';
import { OcrRegionActionPanel } from '../OcrRegionActionPanel';
import { OcrTableReviewPanel } from '../OcrTableReviewPanel';
import { OcrWriterInsertPanel } from '../OcrWriterInsertPanel';
import { useEditorStore } from '@/core/editor/store';
import { useWriterStore } from '@/core/writer/store';
import { Button } from '@/components/ui/Button';

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
  const [lastRegionWriterElementType, setLastRegionWriterElementType] = React.useState<string | null>(null);
  const [lastRegionTableBlock, setLastRegionTableBlock] = React.useState<OcrTableBlock | null>(null);
  const [lastAcceptedTableSummary, setLastAcceptedTableSummary] = React.useState<string | null>(null);
  const [lastInsertedWriterCount, setLastInsertedWriterCount] = React.useState<number | null>(null);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const setWriterActiveTool = useWriterStore((state) => state.setActiveTool);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- document switches must reset document-scoped review state before stale selections remain actionable. */
    setSelectedLowConfidenceWordId(null);
    setSelectedRegionId(null);
    setLastRegionWriterElementType(null);
    setLastRegionTableBlock(null);
    setLastAcceptedTableSummary(null);
    setLastInsertedWriterCount(null);
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

  const selectedRegionPageInput = React.useMemo(() => {
    if (!selectedRegion) return null;
    return pages?.find((page) => page.pageIndex === selectedRegion.pageIndex) ?? null;
  }, [
    pages,
    selectedRegion,
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
    || currentWriterInsertionQueue.candidates.length > 0
    || lastInsertedWriterCount !== null;

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
        <div
          className="space-y-2"
          data-testid="ocr-review-workspace-regions"
        >
          <div
            className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100"
            data-testid="ocr-region-document-guidance"
          >
            <div className="font-semibold">Select OCR areas on the PDF itself</div>
            <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-300">
              Use OCR Area, then drag over the real page. Region coordinates come from the rendered document instead of a synthetic preview.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => {
                setActiveMode('annotate');
                setSidebarTab('ocr');
                setWriterActiveTool('ocr-region');
              }}
            >
              Select OCR Area
            </Button>
          </div>
          {currentRegions.length > 0 ? (
            <OcrRegionListPanel
              regions={currentRegions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={(region) => {
                setSelectedRegionId(region.id);
                useOcrStore.getState().focusOcrTarget({
                  documentFingerprint,
                  pageIndex: region.pageIndex,
                  bbox: region.bbox,
                  targetId: region.id,
                  source: 'region',
                  label: `OCR ${region.mode} area`,
                });
              }}
              onDeleteRegion={(regionId) => {
                useOcrStore.getState().deleteOcrRegion(regionId);
                if (selectedRegionId === regionId) {
                  setSelectedRegionId(null);
                }
              }}
            />
          ) : null}
          <OcrRegionActionPanel
            region={selectedRegion}
            pageInput={selectedRegionPageInput}
            resolvePageInput={
              selectedRegion && (pdfBytes || selectedRegionPageInput)
                ? async (region) => {
                    const resolved = await resolveOcrRegionPageInput({
                      region,
                      pdfBytes,
                      fallbackPageInput: selectedRegionPageInput,
                      scale: 2,
                      mimeType: 'image/png',
                    });
                    return {
                      pageInput: resolved.pageInput,
                      diagnostics: resolved.diagnostics,
                    };
                  }
                : undefined
            }
            onRegionResult={(result) => {
              const tableBlock = result.blocks.find(
                (block): block is OcrTableBlock => block.type === 'table',
              );
              setLastRegionTableBlock(tableBlock ?? null);
              setLastAcceptedTableSummary(null);
            }}
            onWriterElementCreated={(element) => {
              setLastRegionWriterElementType(element.type);
              queueWriterElement(element, 'ocrRegion');
            }}
          />
          {lastRegionWriterElementType ? (
            <p
              className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
              data-testid="ocr-region-writer-created"
            >
              Region created Writer element: {lastRegionWriterElementType}
            </p>
          ) : null}
        </div>
      ) : null}

      {lastRegionTableBlock ? (
        <div
          className="space-y-2"
          data-testid="ocr-review-workspace-table"
        >
          <OcrTableReviewPanel
            tableBlock={lastRegionTableBlock}
            onAcceptTable={(tableData) => {
              setLastAcceptedTableSummary(
                `${tableData.rows.length} rows × ${tableData.columns.length} columns`,
              );
              if (selectedRegion) {
                const element = createReviewedOcrTableWriterElement({
                  documentFingerprint,
                  region: selectedRegion,
                  tableData,
                });
                queueWriterElement(element, 'ocrTableReview');
              }
            }}
          />
          {lastAcceptedTableSummary ? (
            <p
              className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              data-testid="ocr-table-accepted-summary"
            >
              OCR table accepted: {lastAcceptedTableSummary}
            </p>
          ) : null}
        </div>
      ) : null}

      {currentWriterInsertionQueue.candidates.length > 0 || lastInsertedWriterCount !== null ? (
        <div
          className="space-y-2"
          data-testid="ocr-review-workspace-writer"
        >
          <OcrWriterInsertPanel
            queue={currentWriterInsertionQueue}
            onQueueChange={handleCurrentWriterInsertionQueueChange}
            onInsertElements={async (elements) => {
              await onInsertWriterElements?.(
                elements,
              );
              setLastInsertedWriterCount(
                elements.length,
              );
            }}
          />
          {lastInsertedWriterCount !== null ? (
            <p
              className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              data-testid="ocr-writer-inserted-summary"
            >
              Inserted {lastInsertedWriterCount} OCR Writer element(s).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default OcrReviewWorkspace;
