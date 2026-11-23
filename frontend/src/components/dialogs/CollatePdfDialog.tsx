import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parsePageRangeString } from '@/core/pages/pageRangeParser';
import { planCollation, type CollationMode } from '@/core/pdf-mutation/pdfCollation';
import { GitMerge, ArrowRightLeft, Layers } from 'lucide-react';

export interface CollatePdfDialogProps {
  isOpen: boolean;
  primaryFileName: string;
  primaryPageCount: number;
  donorFileName: string;
  donorPageCount: number;
  onClose: () => void;
  onConfirm: (config: {
    mode: CollationMode;
    donorPageIndices?: number[];
  }) => void;
}

export const CollatePdfDialog: React.FC<CollatePdfDialogProps> = ({
  isOpen,
  primaryFileName,
  primaryPageCount,
  donorFileName,
  donorPageCount,
  onClose,
  onConfirm,
}) => {
  const [mode, setMode] = useState<CollationMode>('forward');
  const [pageScope, setPageScope] = useState<'all' | 'custom'>('all');
  const [rangeText, setRangeText] = useState(
    donorPageCount > 1 ? `1-${donorPageCount}` : '1',
  );

  const rangeValidation = useMemo(() => {
    if (pageScope === 'all') return { valid: true, pageIndices: undefined };
    return parsePageRangeString(rangeText, donorPageCount);
  }, [pageScope, rangeText, donorPageCount]);

  const activeDonorIndices = rangeValidation.valid
    ? rangeValidation.pageIndices
    : undefined;

  const plan = useMemo(() => {
    try {
      return planCollation(
        primaryPageCount,
        donorPageCount,
        mode,
        activeDonorIndices,
      );
    } catch {
      return null;
    }
  }, [primaryPageCount, donorPageCount, mode, activeDonorIndices]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rangeValidation.valid) return;

    onConfirm({
      mode,
      donorPageIndices: activeDonorIndices,
    });
    onClose();
  };

  const isSubmitDisabled = pageScope === 'custom' && !rangeValidation.valid;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Collate / Interleave Document">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Document Comparison Summary */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2.5">
            <span className="font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider text-[10px]">
              Doc 1 (Current)
            </span>
            <div className="font-medium text-slate-800 dark:text-slate-100 truncate mt-0.5" title={primaryFileName}>
              {primaryFileName}
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-0.5">
              {primaryPageCount} page{primaryPageCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-2.5">
            <span className="font-semibold text-blue-600 dark:text-blue-400 block uppercase tracking-wider text-[10px]">
              Doc 2 (To Interleave)
            </span>
            <div className="font-medium text-slate-800 dark:text-slate-100 truncate mt-0.5" title={donorFileName}>
              {donorFileName}
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-0.5">
              {donorPageCount} page{donorPageCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Collation Mode */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Collation Pattern
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="collate-mode-forward"
              onClick={() => setMode('forward')}
              className={`flex flex-col text-left p-2.5 rounded-lg border text-xs transition-all ${
                mode === 'forward'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium ring-1 ring-blue-500'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <GitMerge className="w-3.5 h-3.5" />
                <span>Forward Alternating</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                1A, 1B, 2A, 2B, 3A, 3B...
              </span>
            </button>
            <button
              type="button"
              data-testid="collate-mode-reverse-duplex"
              onClick={() => setMode('reverse-duplex')}
              className={`flex flex-col text-left p-2.5 rounded-lg border text-xs transition-all ${
                mode === 'reverse-duplex'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium ring-1 ring-blue-500'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Reverse Duplex Scan</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                1A, NB, 2A, (N-1)B... (reverse back)
              </span>
            </button>
          </div>
        </div>

        {/* Page Scope for Donor Document */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Doc 2 Pages to Include
          </label>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="pageScope"
                value="all"
                checked={pageScope === 'all'}
                onChange={() => setPageScope('all')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>All {donorPageCount} pages</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="pageScope"
                value="custom"
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
                data-testid="collate-range-input"
                type="text"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder={`e.g. 1-${donorPageCount} or 1, 3, 5`}
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

        {/* Live Sequence Preview */}
        {plan && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>Resulting Sequence ({plan.totalPageCount} pages total)</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-1">
              {plan.sequence.slice(0, 10).map((item, idx) => (
                <span
                  key={`${item.source}-${item.sourcePageIndex}-${idx}`}
                  className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    item.source === 'primary'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-semibold'
                  }`}
                >
                  {idx + 1}. {item.label}
                </span>
              ))}
              {plan.sequence.length > 10 && (
                <span className="text-[10px] text-slate-400 self-center">
                  +{plan.sequence.length - 10} more...
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            data-testid="collate-submit-button"
            disabled={isSubmitDisabled}
          >
            Collate Documents
          </Button>
        </div>
      </form>
    </Modal>
  );
};
