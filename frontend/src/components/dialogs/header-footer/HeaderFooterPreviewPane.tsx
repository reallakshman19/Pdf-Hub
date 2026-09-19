import React from 'react';

import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import type {
  ResolvedHeaderFooterPage,
} from '@/core/header-footer/resolutionTypes';
import { HeaderFooterPreview } from './HeaderFooterPreview';

interface HeaderFooterPreviewPaneProps {
  pages: ResolvedHeaderFooterPage[];
  pageGraph: PageGraph<PageNode>;
  previewPageId: PageId | null;
  error: string | null;
  warnings: string[];
  onPreviewPageChange: (pageId: PageId) => void;
}

export const HeaderFooterPreviewPane: React.FC<
  HeaderFooterPreviewPaneProps
> = ({
  pages,
  pageGraph,
  previewPageId,
  error,
  warnings,
  onPreviewPageChange,
}) => {
  const previewPage = previewPageId
    ? pages.find((page) => page.pageId === previewPageId)
    : undefined;
  const previewNode = previewPage
    ? pageGraph.pages.find((page) => page.pageId === previewPage.pageId)
    : undefined;

  return (
    <div className="grid gap-4 border-t border-slate-200 pt-3 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Representative page
        </div>

        {pages.length > 0 ? (
          <select
            value={previewPageId ?? ''}
            onChange={(event) =>
              onPreviewPageChange(event.target.value)
            }
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Preview page"
          >
            {pages.map((page) => (
              <option key={page.pageId} value={page.pageId}>
                Physical {page.physicalPageNumber}
                {' · '}
                {page.logicalPageLabel || 'no logical label'}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-slate-500">
            No page currently matches this rule.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {warnings.length > 0 && (
          <div
            role="note"
            className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {warnings.join(' ')}
          </div>
        )}
      </div>

      {previewPage && previewNode ? (
        <HeaderFooterPreview
          page={previewPage}
          pageNode={previewNode}
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-700">
          Preview unavailable
        </div>
      )}
    </div>
  );
};
