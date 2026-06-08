import React from 'react';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import type { OcrAnyBlock, OcrTableBlock } from '@/core/ocr/types';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import type { WriterElementV2, WriterTableData } from '@/core/writer-v2/types';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { resolveOcrRegionPageInput } from '@/core/ocr/ocrRegionRasterBridge';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  createReviewedOcrTableWriterElement,
  upsertOcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';

export interface UseOcrReviewCoordinatorArgs {
  effectiveDocumentFingerprint: string;
  selectedPages: number[];
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  onInsertWriterElements?: (elements: WriterElementV2[]) => void;
}

export function useOcrReviewCoordinator({
  effectiveDocumentFingerprint,
  selectedPages,
  pages,
  pdfBytes,
  onInsertWriterElements,
}: UseOcrReviewCoordinatorArgs) {
  const store = useOcrStore();
  const [selectedLowConfidenceWordId, setSelectedLowConfidenceWordId] = React.useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = React.useState<string | null>(null);
  const [lastRegionWriterElementType, setLastRegionWriterElementType] = React.useState<string | null>(null);
  const [lastRegionTableBlock, setLastRegionTableBlock] = React.useState<OcrTableBlock | null>(null);
  const [lastAcceptedTableSummary, setLastAcceptedTableSummary] = React.useState<string | null>(null);
  const [writerInsertionQueue, setWriterInsertionQueue] = React.useState<OcrWriterInsertionQueueState>(() =>
    createOcrWriterInsertionQueue(),
  );
  const [lastInsertedWriterCount, setLastInsertedWriterCount] = React.useState<number | null>(null);

  const selectedRegion = React.useMemo(() => {
    if (!selectedRegionId) return null;
    return store.regions.find((region) => region.id === selectedRegionId) ?? null;
  }, [selectedRegionId, store.regions]);

  const selectedRegionPageInput = React.useMemo(() => {
    if (!selectedRegion) return null;
    const existing = pages?.find((page) => page.pageIndex === selectedRegion.pageIndex);
    if (existing) return existing;
    return {
      pageIndex: selectedRegion.pageIndex,
      imageBytes: new Uint8Array([1, 2, 3]),
      width: 595,
      height: 842,
      imageCount: 1,
      region: selectedRegion.bbox,
    };
  }, [pages, selectedRegion]);

  const selectedLowConfidenceWord = React.useMemo(() => {
    if (!selectedLowConfidenceWordId) return null;
    return store.lowConfidenceWords.find(
      (item) => item.word.id === selectedLowConfidenceWordId,
    )?.word ?? null;
  }, [selectedLowConfidenceWordId, store.lowConfidenceWords]);

  const queueWriterElement = React.useCallback((element: WriterElementV2, source: 'ocrRegion' | 'ocrTableReview') => {
    setWriterInsertionQueue((current) =>
      upsertOcrWriterInsertionCandidate(
        current,
        createOcrWriterInsertionCandidate({ source, element }),
      ),
    );
  }, []);

  const createRegion = React.useCallback((region: OcrRegion) => {
    useOcrStore.getState().upsertOcrRegion(region);
    setSelectedRegionId(region.id);
  }, []);

  const deleteRegion = React.useCallback((regionId: string) => {
    useOcrStore.getState().deleteOcrRegion(regionId);
    setSelectedRegionId((current) => current === regionId ? null : current);
  }, []);

  const resolveSelectedRegionPageInput = React.useCallback(async (region: OcrRegion) => {
    const resolved = await resolveOcrRegionPageInput({
      region,
      pdfBytes: pages ? null : pdfBytes,
      fallbackPageInput: selectedRegionPageInput,
      scale: 2,
      mimeType: 'image/png',
    });
    return {
      pageInput: resolved.pageInput,
      diagnostics: resolved.diagnostics,
    };
  }, [pages, pdfBytes, selectedRegionPageInput]);

  const handleRegionResult = React.useCallback((result: { blocks: OcrAnyBlock[] }) => {
    const tableBlock = result.blocks.find(
      (block): block is OcrTableBlock => block.type === 'table',
    );
    setLastRegionTableBlock(tableBlock ?? null);
    setLastAcceptedTableSummary(null);
  }, []);

  const handleWriterElementCreated = React.useCallback((element: WriterElementV2) => {
    setLastRegionWriterElementType(element.type);
    queueWriterElement(element, 'ocrRegion');
  }, [queueWriterElement]);

  const handleAcceptTable = React.useCallback((tableData: WriterTableData) => {
    setLastAcceptedTableSummary(`${tableData.rows.length} rows × ${tableData.columns.length} columns`);
    if (!selectedRegion) return;
    const element = createReviewedOcrTableWriterElement({
      documentFingerprint: effectiveDocumentFingerprint,
      region: selectedRegion,
      tableData,
    });
    queueWriterElement(element, 'ocrTableReview');
  }, [effectiveDocumentFingerprint, queueWriterElement, selectedRegion]);

  const handleInsertElements = React.useCallback((elements: WriterElementV2[]) => {
    onInsertWriterElements?.(elements);
    setLastInsertedWriterCount(elements.length);
  }, [onInsertWriterElements]);

  return {
    selectedPages,
    selectedRegion,
    selectedRegionId,
    setSelectedRegionId,
    selectedRegionPageInput,
    selectedLowConfidenceWord,
    selectedLowConfidenceWordId,
    setSelectedLowConfidenceWordId,
    lastRegionWriterElementType,
    lastRegionTableBlock,
    lastAcceptedTableSummary,
    writerInsertionQueue,
    setWriterInsertionQueue,
    lastInsertedWriterCount,
    createRegion,
    deleteRegion,
    resolveSelectedRegionPageInput,
    handleRegionResult,
    handleWriterElementCreated,
    handleAcceptTable,
    handleInsertElements,
  };
}
