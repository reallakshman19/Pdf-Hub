import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parsePageRangeString } from '@/core/pages/pageRangeParser';
import {
  PRESET_DIMENSIONS,
  type PageDimensionPreset,
  type NormalizationStrategy,
  type NormalizeOptions,
} from '@/core/pdf-mutation/pdfNormalization';
import { Maximize2, Layout, Compass } from 'lucide-react';

export interface NormalizePageSizeDialogProps {
  isOpen: boolean;
  totalDocumentPages: number;
  selectedPages: number[];
  currentPage: number;
  onClose: () => void;
  onConfirm: (options: NormalizeOptions) => void;
}

export const NormalizePageSizeDialog: React.FC<NormalizePageSizeDialogProps> = ({
  isOpen,
  totalDocumentPages,
  selectedPages,
  currentPage,
  onClose,
  onConfirm,
}) => {
  const [preset, setPreset] = useState<PageDimensionPreset>('A4');
  const [strategy, setStrategy] = useState<NormalizationStrategy>('fit');
  const [orientation, setOrientation] = useState<'preserve' | 'portrait' | 'landscape'>('preserve');
  const [pageScope, setPageScope] = useState<'all' | 'selected' | 'custom'>(
    selectedPages.length > 0 ? 'selected' : 'all',
  );
  const [rangeText, setRangeText] = useState(
    selectedPages.length > 0
      ? selectedPages.join(', ')
      : String(currentPage || 1),
  );
  const [customWidth, setCustomWidth] = useState('612');
  const [customHeight, setCustomHeight] = useState('792');

  const rangeValidation = useMemo(() => {
    if (pageScope === 'all') return { valid: true, pageIndices: undefined };
    if (pageScope === 'selected') {
      return {
        valid: selectedPages.length > 0,
        pageIndices: selectedPages.map((p) => p - 1),
      };
    }
    return parsePageRangeString(rangeText, totalDocumentPages);
  }, [pageScope, selectedPages, rangeText, totalDocumentPages]);

  const customDimensionsValid = useMemo(() => {
    if (preset !== 'Custom') return true;
    const w = parseFloat(customWidth);
    const h = parseFloat(customHeight);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  }, [preset, customWidth, customHeight]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rangeValidation.valid || !customDimensionsValid) return;

    onConfirm({
      preset,
      strategy,
      orientation,
      pageIndices: rangeValidation.pageIndices,
      customDimensions:
        preset === 'Custom'
          ? { width: parseFloat(customWidth), height: parseFloat(customHeight) }
          : undefined,
    });
    onClose();
  };

  const isSubmitDisabled = !rangeValidation.valid || !customDimensionsValid;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Normalize Page Dimensions">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preset Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Layout className="w-3.5 h-3.5 text-blue-500" />
            <span>Target Page Size</span>
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(['A4', 'Letter', 'MatchFirstPage'] as PageDimensionPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`preset-${p}`}
                onClick={() => setPreset(p)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  preset === p
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                }`}
              >
                <div className="font-semibold">{p === 'MatchFirstPage' ? 'Match Page 1' : p}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {p === 'A4'
                    ? `${Math.round(PRESET_DIMENSIONS.A4.width)} × ${Math.round(PRESET_DIMENSIONS.A4.height)} pt`
                    : p === 'Letter'
                    ? `${PRESET_DIMENSIONS.Letter.width} × ${PRESET_DIMENSIONS.Letter.height} pt`
                    : 'Auto-detect'}
                </div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs mt-2">
            {(['Legal', 'A3', 'Custom'] as PageDimensionPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`preset-${p}`}
                onClick={() => setPreset(p)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  preset === p
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                }`}
              >
                <div className="font-semibold">{p}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {p === 'Legal'
                    ? `${PRESET_DIMENSIONS.Legal.width} × ${PRESET_DIMENSIONS.Legal.height} pt`
                    : p === 'A3'
                    ? `${Math.round(PRESET_DIMENSIONS.A3.width)} × ${Math.round(PRESET_DIMENSIONS.A3.height)} pt`
                    : 'Specify pt'}
                </div>
              </button>
            ))}
          </div>

          {preset === 'Custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-0.5">Width (pt)</label>
                <input
                  type="number"
                  data-testid="custom-width-input"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-0.5">Height (pt)</label>
                <input
                  type="number"
                  data-testid="custom-height-input"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content Strategy */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-blue-500" />
            <span>Content Fit Strategy</span>
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              data-testid="strategy-fit"
              onClick={() => setStrategy('fit')}
              className={`p-2 rounded-lg border text-left transition-all ${
                strategy === 'fit'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="font-semibold">Proportional Fit</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Scale & center</div>
            </button>
            <button
              type="button"
              data-testid="strategy-center"
              onClick={() => setStrategy('center')}
              className={`p-2 rounded-lg border text-left transition-all ${
                strategy === 'center'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="font-semibold">Center Content</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Keep 100% size</div>
            </button>
            <button
              type="button"
              data-testid="strategy-expand"
              onClick={() => setStrategy('expand')}
              className={`p-2 rounded-lg border text-left transition-all ${
                strategy === 'expand'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="font-semibold">Adjust Canvas</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Resize box only</div>
            </button>
          </div>
        </div>

        {/* Orientation Preference */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-blue-500" />
            <span>Orientation</span>
          </label>
          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="orientation"
                checked={orientation === 'preserve'}
                onChange={() => setOrientation('preserve')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Preserve per-page</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="orientation"
                checked={orientation === 'portrait'}
                onChange={() => setOrientation('portrait')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Force Portrait</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="orientation"
                checked={orientation === 'landscape'}
                onChange={() => setOrientation('landscape')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Force Landscape</span>
            </label>
          </div>
        </div>

        {/* Page Scope */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Apply to Pages
          </label>
          <div className="flex gap-4 mb-2 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="normPageScope"
                checked={pageScope === 'all'}
                onChange={() => setPageScope('all')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>All ({totalDocumentPages})</span>
            </label>
            {selectedPages.length > 0 && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="normPageScope"
                  checked={pageScope === 'selected'}
                  onChange={() => setPageScope('selected')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Selected ({selectedPages.length})</span>
              </label>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="normPageScope"
                checked={pageScope === 'custom'}
                onChange={() => setPageScope('custom')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Custom range</span>
            </label>
          </div>

          {pageScope === 'custom' && (
            <div className="space-y-1">
              <input
                data-testid="normalize-range-input"
                type="text"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder={`e.g. 1-${totalDocumentPages} or 1, 3, 5`}
                className={`w-full px-2.5 py-1.5 text-xs rounded-md border bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  rangeValidation.valid
                    ? 'border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                    : 'border-red-500 text-red-900 dark:text-red-200'
                }`}
              />
              {!rangeValidation.valid && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  {rangeValidation.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            data-testid="normalize-submit-button"
            disabled={isSubmitDisabled}
          >
            Normalize Dimensions
          </Button>
        </div>
      </form>
    </Modal>
  );
};
