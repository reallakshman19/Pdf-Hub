import React from 'react';
import {
  MapPinned,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';

export interface OcrRegionListPanelProps {
  regions: OcrRegion[];
  selectedRegionId?: string | null;
  onSelectRegion?: (region: OcrRegion) => void;
  onDeleteRegion?: (regionId: string) => void;
}

export const OcrRegionListPanel: React.FC<OcrRegionListPanelProps> = ({
  regions,
  selectedRegionId,
  onSelectRegion,
  onDeleteRegion,
}) => {
  return (
    <div
      className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="ocr-region-list-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-blue-600" />
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              OCR Regions
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Stored OCR target regions.
            </p>
          </div>
        </div>

        <span
          className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          data-testid="ocr-region-count"
        >
          {regions.length}
        </span>
      </div>

      {regions.length === 0 ? (
        <p
          className="rounded bg-slate-50 px-2 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"
          data-testid="ocr-region-empty"
        >
          No OCR regions added.
        </p>
      ) : (
        <div className="space-y-1">
          {regions.map((region) => {
            const selected = selectedRegionId === region.id;

            return (
              <div
                key={region.id}
                className={[
                  'rounded border px-2 py-2 text-xs',
                  selected
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
                ].join(' ')}
                data-testid="ocr-region-row"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onSelectRegion?.(region)}
                  data-testid="ocr-region-select"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {region.mode}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Page {region.pageIndex + 1}
                    </span>
                  </div>

                  <div className="mt-0.5 text-[11px] text-slate-500">
                    x {Math.round(region.bbox.x)}, y {Math.round(region.bbox.y)}, w {Math.round(region.bbox.width)}, h {Math.round(region.bbox.height)}
                  </div>
                </button>

                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDeleteRegion?.(region.id)}
                    data-testid="ocr-region-delete"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
