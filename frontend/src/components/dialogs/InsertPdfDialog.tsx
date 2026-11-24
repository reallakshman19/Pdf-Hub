import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { parsePageRangeString } from '@/core/pages/pageRangeParser';

export interface InsertPdfDialogProps {
  isOpen: boolean;
  donorFileName: string;
  donorPageCount: number;
  currentPage: number;
  totalDocumentPages: number;
  initialPlacement?: 'before' | 'after';
  onClose: () => void;
  onConfirm: (config: {
    donorPageIndices?: number[];
    placement: 'before' | 'after';
    targetPage: number;
  }) => void;
}

export const InsertPdfDialog: React.FC<InsertPdfDialogProps> = ({
  isOpen,
  donorFileName,
  donorPageCount,
  currentPage,
  totalDocumentPages,
  initialPlacement = 'after',
  onClose,
  onConfirm,
}) => {
  const [pageScope, setPageScope] = useState<'all' | 'custom'>('all');
  const [rangeText, setRangeText] = useState(
    donorPageCount > 1 ? `1-${donorPageCount}` : '1',
  );
  const [placement, setPlacement] = useState<'before' | 'after'>(initialPlacement);
  const [targetPage, setTargetPage] = useState<number>(
    Math.max(1, Math.min(Math.max(1, totalDocumentPages), currentPage)),
  );

  const rangeValidation = useMemo(() => {
    if (pageScope === 'all') return { valid: true };
    return parsePageRangeString(rangeText, donorPageCount);
  }, [pageScope, rangeText, donorPageCount]);

  // Confirm hands the staged operation to the owner, which closes the dialog
  // itself. Calling onClose here would run the owner's cancel path, which
  // aborts the very operation just confirmed.
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pageScope === 'all') {
      onConfirm({
        donorPageIndices: undefined,
        placement,
        targetPage,
      });
      return;
    }

    if (!rangeValidation.valid || !rangeValidation.pageIndices) {
      return;
    }

    onConfirm({
      donorPageIndices: rangeValidation.pageIndices,
      placement,
      targetPage,
    });
  };

  const isSubmitDisabled = pageScope === 'custom' && !rangeValidation.valid;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insert Pages from PDF">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source File Summary */}
        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Source PDF
          </p>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mt-0.5">
            {donorFileName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {donorPageCount} total page{donorPageCount === 1 ? '' : 's'} available
          </p>
        </div>

        {/* Source Page Scope */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Pages to Insert
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="pageScope"
                value="all"
                checked={pageScope === 'all'}
                onChange={() => setPageScope('all')}
                className="text-blue-600 focus:ring-blue-500"
              />
              All pages (1–{donorPageCount})
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="pageScope"
                value="custom"
                checked={pageScope === 'custom'}
                onChange={() => setPageScope('custom')}
                className="text-blue-600 focus:ring-blue-500"
              />
              Selected pages or range
            </label>
          </div>

          {pageScope === 'custom' && (
            <div className="mt-2 pl-6">
              <input
                type="text"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder="e.g. 1-3, 5"
                className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                aria-label="Custom page range"
              />
              {!rangeValidation.valid ? (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {rangeValidation.error}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {rangeValidation.pageIndices?.length ?? 0} page(s) selected
                </p>
              )}
            </div>
          )}
        </div>

        {/* Placement Location */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Location in Current Document
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Placement
              </label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value as 'before' | 'after')}
                className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Target Page
              </label>
              <input
                type="number"
                min={1}
                max={Math.max(1, totalDocumentPages)}
                value={targetPage}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(val)) {
                    setTargetPage(Math.max(1, Math.min(Math.max(1, totalDocumentPages), val)));
                  }
                }}
                className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-blue-500"
                aria-label="Target page number"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Current document has {totalDocumentPages} page{totalDocumentPages === 1 ? '' : 's'}.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitDisabled}>
            Insert Pages
          </Button>
        </div>
      </form>
    </Modal>
  );
};
