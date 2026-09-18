import React from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  buildPageLabelRangesForRestart,
  previewPageLabelRestart,
} from '@/core/pages/pageLabelEditing';
import { physicalIndexForPageId } from '@/core/pages/pageGraph';
import type {
  PageGraph,
  PageId,
  PageLabelRange,
  PageLabelStyle,
  PageNode,
} from '@/core/pages/types';

interface PageLabelsDialogProps {
  isOpen: boolean;
  pageGraph: PageGraph<PageNode>;
  currentPageId: PageId | null;
  selectedPageIds: PageId[];
  onClose: () => void;
  onApply: (ranges: PageLabelRange[]) => Promise<boolean>;
}

type StyleChoice = PageLabelStyle | 'prefix-only';

const STYLE_OPTIONS: Array<{ value: StyleChoice; label: string }> = [
  { value: 'decimal', label: 'Decimal — 1, 2, 3' },
  { value: 'roman-lower', label: 'Roman lowercase — i, ii, iii' },
  { value: 'roman-upper', label: 'Roman uppercase — I, II, III' },
  { value: 'letters-lower', label: 'Letters lowercase — a, b, c' },
  { value: 'letters-upper', label: 'Letters uppercase — A, B, C' },
  { value: 'prefix-only', label: 'Prefix only — Cover, Cover…' },
];

export const PageLabelsDialog: React.FC<PageLabelsDialogProps> = ({
  isOpen,
  pageGraph,
  currentPageId,
  selectedPageIds,
  onClose,
  onApply,
}) => {
  const selectedStartPageId = React.useMemo(
    () =>
      pageGraph.pages.find((page) => selectedPageIds.includes(page.pageId))
        ?.pageId
      ?? null,
    [pageGraph, selectedPageIds],
  );
  const [targetSource, setTargetSource] = React.useState<'current' | 'selected'>(
    selectedStartPageId ? 'selected' : 'current',
  );
  const [style, setStyle] = React.useState<StyleChoice>('decimal');
  const [prefix, setPrefix] = React.useState('');
  const [startNumber, setStartNumber] = React.useState(1);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setTargetSource(selectedStartPageId ? 'selected' : 'current');
  }, [isOpen, selectedStartPageId]);

  const targetPageId =
    targetSource === 'selected' && selectedStartPageId
      ? selectedStartPageId
      : currentPageId ?? pageGraph.pages[0]?.pageId ?? null;

  React.useEffect(() => {
    if (!isOpen || !targetPageId) return;
    const existing = pageGraph.pageLabelRanges?.find(
      (range) => range.startPageId === targetPageId,
    );
    setStyle(existing?.style ?? (existing?.prefix ? 'prefix-only' : 'decimal'));
    setPrefix(existing?.prefix ?? '');
    setStartNumber(existing?.startNumber ?? 1);
  }, [isOpen, pageGraph, targetPageId]);

  const draft = React.useMemo(
    () => ({
      ...(style === 'prefix-only' ? {} : { style }),
      ...(prefix.length > 0 ? { prefix } : {}),
      ...(style === 'prefix-only' ? {} : { startNumber }),
    }),
    [prefix, startNumber, style],
  );

  const preview = React.useMemo(() => {
    if (!targetPageId) {
      return { graph: null, ranges: null, error: 'No page is available.' };
    }

    try {
      const ranges = buildPageLabelRangesForRestart(
        pageGraph,
        targetPageId,
        draft,
      );
      return {
        graph: previewPageLabelRestart(pageGraph, targetPageId, draft),
        ranges,
        error: null,
      };
    } catch (error) {
      return {
        graph: null,
        ranges: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [draft, pageGraph, targetPageId]);

  const targetIndex = targetPageId
    ? physicalIndexForPageId(pageGraph, targetPageId)
    : -1;
  const previewStart = Math.max(0, targetIndex - 2);
  const previewEnd = Math.min(
    pageGraph.pages.length,
    Math.max(previewStart + 5, targetIndex + 4),
  );
  const previewPages = preview.graph?.pages.slice(previewStart, previewEnd) ?? [];

  const hasResolvedImportedLabels =
    pageGraph.pageLabelRanges === undefined
    && pageGraph.pages.some((page) => page.logicalLabel !== undefined);
  const hasAnyLabels =
    (pageGraph.pageLabelRanges?.length ?? 0) > 0
    || pageGraph.pages.some((page) => page.logicalLabel !== undefined);

  const handleApply = async () => {
    if (!preview.ranges) return;
    setSubmitting(true);
    try {
      const applied = await onApply(preview.ranges);
      if (applied) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    setSubmitting(true);
    try {
      const applied = await onApply([]);
      if (applied) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const targetPageNumber = targetIndex >= 0 ? targetIndex + 1 : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Logical Page Labels">
      <div className="space-y-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          Page labels change the PDF navigator label only. They do not print a
          number on the page. Use Header/Footer for visible page numbers.
        </div>

        {hasResolvedImportedLabels && (
          <div
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          >
            This PDF has imported logical labels, but its original compact range
            definitions are not editable in this session. Applying a restart
            replaces that scheme with decimal labels before the restart and the
            new range from the chosen page.
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Start / restart at
          </label>
          <select
            value={targetSource}
            onChange={(event) =>
              setTargetSource(event.target.value as 'current' | 'selected')
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="current">
              Current page{currentPageId ? ' (' + pageNumberForId(pageGraph, currentPageId) + ')' : ''}
            </option>
            {selectedStartPageId && (
              <option value="selected">
                First selected page ({pageNumberForId(pageGraph, selectedStartPageId)})
              </option>
            )}
          </select>
          {targetPageNumber && (
            <p className="mt-1 text-xs text-slate-500">
              Physical page {targetPageNumber}; existing logical label:{' '}
              {pageGraph.pages[targetPageNumber - 1]?.logicalLabel ?? 'none'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Numbering style
          </label>
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value as StyleChoice)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Prefix
            </label>
            <input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="e.g. A-"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Start at
            </label>
            <input
              type="number"
              min={1}
              step={1}
              disabled={style === 'prefix-only'}
              value={startNumber}
              onChange={(event) =>
                setStartNumber(Math.max(1, Math.trunc(Number(event.target.value) || 1)))
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Preview
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
            {preview.error ? (
              <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {preview.error}
              </div>
            ) : (
              previewPages.map((page) => (
                <div
                  key={page.pageId}
                  className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-xs last:border-b-0 dark:border-slate-800"
                >
                  <span>Physical page {page.currentIndex + 1}</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {page.logicalLabel ?? '—'}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Existing later restart ranges remain in place. Reapply at the same
            page to replace that restart.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleClear()}
            disabled={!hasAnyLabels || submitting}
          >
            Clear labels
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleApply()}
              disabled={Boolean(preview.error) || submitting}
            >
              {submitting ? 'Applying…' : 'Apply restart'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

function pageNumberForId(
  graph: PageGraph<PageNode>,
  pageId: PageId,
): number {
  const index = physicalIndexForPageId(graph, pageId);
  return index >= 0 ? index + 1 : 1;
}
