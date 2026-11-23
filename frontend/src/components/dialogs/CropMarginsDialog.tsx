import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type {
  CropMarginOptions,
  CropMode,
  UniformMarginTrim,
} from '@/core/pdf-mutation/pdfMarginCropping';
import { Sparkles, Sliders, RotateCcw } from 'lucide-react';

export interface CropMarginsDialogProps {
  isOpen: boolean;
  totalDocumentPages: number;
  selectedPages: number[];
  currentPage: number;
  onClose: () => void;
  onConfirm: (options: CropMarginOptions) => Promise<void> | void;
}

const PRESET_TRIMS: Array<{ label: string; values: UniformMarginTrim }> = [
  { label: 'Tight (10pt ~ 3.5mm)', values: { topPt: 10, bottomPt: 10, leftPt: 10, rightPt: 10 } },
  { label: 'Standard (24pt ~ 8.5mm)', values: { topPt: 24, bottomPt: 24, leftPt: 24, rightPt: 24 } },
  { label: 'Generous (36pt ~ 12.7mm)', values: { topPt: 36, bottomPt: 36, leftPt: 36, rightPt: 36 } },
];

export const CropMarginsDialog: React.FC<CropMarginsDialogProps> = ({
  isOpen,
  totalDocumentPages,
  selectedPages,
  currentPage,
  onClose,
  onConfirm,
}) => {
  const [mode, setMode] = useState<CropMode>('auto');
  const [autoPaddingPt, setAutoPaddingPt] = useState(14);
  const [uniformMargins, setUniformMargins] = useState<UniformMarginTrim>({
    topPt: 24,
    bottomPt: 24,
    leftPt: 24,
    rightPt: 24,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialTargetPages = selectedPages.length > 0 ? selectedPages : [currentPage || 1];
  const [scope, setScope] = useState<'selected' | 'all'>(
    selectedPages.length > 0 ? 'selected' : 'all',
  );

  const targetCount = scope === 'selected' ? initialTargetPages.length : totalDocumentPages;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const pageIndices = scope === 'selected'
        ? initialTargetPages.map((p) => p - 1)
        : undefined;

      await onConfirm({
        mode,
        autoPaddingPt,
        uniformMargins: mode === 'uniform' ? uniformMargins : undefined,
        pageIndices,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crop Page Margins / Trim Border Whitespace"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-700 dark:text-slate-200">
        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-colors ${
              mode === 'auto'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Detect
          </button>
          <button
            type="button"
            onClick={() => setMode('uniform')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-colors ${
              mode === 'uniform'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Manual Trim
          </button>
          <button
            type="button"
            onClick={() => setMode('reset')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-colors ${
              mode === 'reset'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Crop
          </button>
        </div>

        {/* Mode-Specific Content */}
        {mode === 'auto' && (
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              Smart Whitespace Detection
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Scans drawing vectors and content pixels, detects the active content bounding box, and trims away surrounding printer whitespace.
            </p>
            <div className="pt-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Content Safety Margin (Padding): {autoPaddingPt} pt (~{(autoPaddingPt * 0.3527).toFixed(1)} mm)
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="2"
                value={autoPaddingPt}
                onChange={(e) => setAutoPaddingPt(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Flush (0 pt)</span>
                <span>Standard (14 pt)</span>
                <span>Generous (50 pt)</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'uniform' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TRIMS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setUniformMargins(preset.values)}
                  className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Trim Left (pt)
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={uniformMargins.leftPt}
                  onChange={(e) => setUniformMargins((prev) => ({ ...prev, leftPt: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Trim Right (pt)
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={uniformMargins.rightPt}
                  onChange={(e) => setUniformMargins((prev) => ({ ...prev, rightPt: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Trim Top (pt)
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={uniformMargins.topPt}
                  onChange={(e) => setUniformMargins((prev) => ({ ...prev, topPt: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Trim Bottom (pt)
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={uniformMargins.bottomPt}
                  onChange={(e) => setUniformMargins((prev) => ({ ...prev, bottomPt: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {mode === 'reset' && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-1">
            <div className="font-semibold text-xs text-amber-800 dark:text-amber-300">
              Restore Original Dimensions
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Resets the PDF CropBox to match the original MediaBox. Any previously trimmed border areas will be visible again.
            </p>
          </div>
        )}

        {/* Target Scope */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Apply To
          </label>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="cropScope"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Selected Pages ({initialTargetPages.join(', ')})</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="cropScope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>All Pages ({totalDocumentPages} pages)</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Processing...' : `Apply to ${targetCount} Page${targetCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
