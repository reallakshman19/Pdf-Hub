import React from 'react';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import type { OcrJobRunnerPageInput } from '@/core/ocr/ocrJobRunner';
import type { OcrTableBlock } from '@/core/ocr/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useEditorStore } from '@/core/editor/store';
import { useWriterStore } from '@/core/writer/store';
import { resolveOcrRegionPageInput } from '@/core/ocr/ocrRegionRasterBridge';
import { OcrRegionListPanel } from '../OcrRegionListPanel';
import { OcrRegionActionPanel } from '../OcrRegionActionPanel';
import { Button } from '@/components/ui/Button';

export interface OcrRegionReviewWorkspaceProps {
  documentFingerprint: string;
  regions: OcrRegion[];
  selectedRegionId: string | null;
  onSelectRegionId: (id: string | null) => void;
  pages?: OcrJobRunnerPageInput[];
  pdfBytes?: Uint8Array | null;
  onRegionTableFound?: (tableBlock: OcrTableBlock | null) => void;
  onWriterElementCreated?: (element: WriterElementV2) => void;
}

export const OcrRegionReviewWorkspace: React.FC<OcrRegionReviewWorkspaceProps> = ({
  documentFingerprint,
  regions,
  selectedRegionId,
  onSelectRegionId,
  pages,
  pdfBytes = null,
  onRegionTableFound,
  onWriterElementCreated,
}) => {
  const [lastWriterElementType, setLastWriterElementType] = React.useState<string | null>(null);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);
  const setSidebarTab = useEditorStore((state) => state.setSidebarTab);
  const setWriterActiveTool = useWriterStore((state) => state.setActiveTool);

  const selectedRegion = React.useMemo(() => {
    if (!selectedRegionId) return null;
    return regions.find((region) => region.id === selectedRegionId) ?? null;
  }, [regions, selectedRegionId]);

  const selectedRegionPageInput = React.useMemo(() => {
    if (!selectedRegion) return null;
    return pages?.find((page) => page.pageIndex === selectedRegion.pageIndex) ?? null;
  }, [pages, selectedRegion]);

  return (
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

      {regions.length > 0 ? (
        <OcrRegionListPanel
          regions={regions}
          selectedRegionId={selectedRegionId}
          onSelectRegion={(region) => {
            onSelectRegionId(region.id);
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
              onSelectRegionId(null);
            }
          }}
        />
      ) : null}

      <OcrRegionActionPanel
        region={selectedRegion}
        pageInput={selectedRegionPageInput}
        resolvePageInput={
          selectedRegion && (pdfBytes || selectedRegionPageInput)
            ? async (region, signal) => {
                const resolved = await resolveOcrRegionPageInput({
                  region,
                  pdfBytes,
                  fallbackPageInput: selectedRegionPageInput,
                  scale: 2,
                  mimeType: 'image/png',
                  signal,
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
          onRegionTableFound?.(tableBlock ?? null);
        }}
        onWriterElementCreated={(element) => {
          setLastWriterElementType(element.type);
          onWriterElementCreated?.(element);
        }}
      />

      {lastWriterElementType ? (
        <p
          className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
          data-testid="ocr-region-writer-created"
        >
          Region created Writer element: {lastWriterElementType}
        </p>
      ) : null}
    </div>
  );
};

export default OcrRegionReviewWorkspace;
