import React from 'react';
import { getCachedThumbnailUrl } from '@/core/renderer/thumbnailRenderService';
import { useIsRapidScrolling } from '@/core/renderer/scrollVelocityStore';

export interface PageThumbnailPlaceholderProps {
  pageNumber: number;
  documentKey?: string | null;
  width?: number;
  height?: number;
  isRapidScrolling?: boolean;
  className?: string;
}

export const PageThumbnailPlaceholder: React.FC<PageThumbnailPlaceholderProps> = ({
  pageNumber,
  documentKey,
  width,
  height,
  isRapidScrolling,
  className = '',
}) => {
  const storeRapidScrolling = useIsRapidScrolling();
  const effectiveRapidScrolling = isRapidScrolling ?? storeRapidScrolling;

  const cachedUrl = documentKey
    ? getCachedThumbnailUrl(documentKey, pageNumber)
    : null;

  return (
    <div
      data-testid={`page-placeholder-${pageNumber}`}
      className={`absolute inset-0 select-none pointer-events-none overflow-hidden ${className}`}
      style={{ width: width ? `${width}px` : '100%', height: height ? `${height}px` : '100%' }}
    >
      {cachedUrl ? (
        <img
          src={cachedUrl}
          alt={`Page ${pageNumber} low-resolution preview`}
          className="w-full h-full object-fill filter blur-[0.5px] opacity-90 transition-opacity duration-150"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-slate-900">
          <div className="text-[11px] font-mono font-medium text-slate-300 dark:text-slate-600">
            Page {pageNumber}
          </div>
          {effectiveRapidScrolling && (
            <div className="w-16 h-1 mt-2 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse" />
          )}
        </div>
      )}

      {effectiveRapidScrolling && (
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-900/75 dark:bg-slate-800/80 text-white font-mono text-[10px] font-medium backdrop-blur-sm shadow-sm transition-opacity">
          P. {pageNumber}
        </div>
      )}
    </div>
  );
};
