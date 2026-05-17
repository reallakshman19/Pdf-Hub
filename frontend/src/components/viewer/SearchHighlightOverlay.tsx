/*
 * Search highlight overlay.
 *
 * This overlay draws boxes around search result rects on the current
 * page.  It is a minimal implementation that uses inline styles to
 * position highlights.  A more sophisticated implementation would map
 * coordinates from PDF space to screen space using the page viewport.
 */

import React from 'react';
import type { SearchResult } from '../../core/search/types';

export interface SearchHighlightOverlayProps {
  results: SearchResult[];
  /**
   * The current page number being viewed.
   */
  pageNumber: number;
  /**
   * Function to convert PDF coordinates to screen coordinates.
   */
  toScreen: (rect: { x: number; y: number; width: number; height: number }) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export default function SearchHighlightOverlay({
  results,
  pageNumber,
  toScreen,
}: SearchHighlightOverlayProps): JSX.Element | null {
  const pageResults = results.filter((r) => r.pageNumber === pageNumber);
  if (pageResults.length === 0) {
    return null;
  }
  return (
    <div className="doccraft-search-highlight-overlay">
      {pageResults.flatMap((r) =>
        r.rects.map((rect, idx) => {
          const style = toScreen(rect);
          return <div key={`${r.id}-${idx}`} className="highlight" style={style} />;
        })
      )}
    </div>
  );
}