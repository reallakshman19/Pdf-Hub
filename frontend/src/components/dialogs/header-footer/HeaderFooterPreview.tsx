import React from 'react';
import type { PageNode } from '@/core/pages/types';
import type { ResolvedHeaderFooterPage } from '@/core/header-footer/resolutionTypes';
import { createHeaderFooterVisualGeometry } from '@/core/header-footer/pdfWriterGeometry';

interface HeaderFooterPreviewProps {
  page: ResolvedHeaderFooterPage;
  pageNode: PageNode;
  nativeImageUrl: string | null;
  busy: boolean;
}

export const HeaderFooterPreview: React.FC<HeaderFooterPreviewProps> = ({
  page, pageNode, nativeImageUrl, busy,
}) => {
  const visual = createHeaderFooterVisualGeometry(
    pageNode.width, pageNode.height, pageNode.rotation,
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Physical page {page.physicalPageNumber}</span>
        <span>Logical label: {page.logicalPageLabel || '—'}</span>
      </div>
      <div
        className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-sm border border-slate-300 bg-white shadow-sm dark:border-slate-600"
        style={{ aspectRatio: `${visual.visualWidth} / ${visual.visualHeight}` }}
        data-testid="header-footer-page-preview"
      >
        {nativeImageUrl ? (
          <img
            src={nativeImageUrl}
            alt={`Native PDF rendering of physical page ${page.physicalPageNumber} with the printed header and footer`}
            className="block h-full w-full object-contain"
            data-testid="header-footer-native-image"
          />
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-xs text-slate-500">
            {busy
              ? 'Rendering native PDF preview…'
              : 'Render native preview to see the source page and actual printed placement.'}
          </div>
        )}
      </div>
    </div>
  );
};
