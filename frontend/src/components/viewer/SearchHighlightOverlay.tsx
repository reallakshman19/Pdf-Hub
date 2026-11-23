import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useSearchStore } from '@/core/search/store';
import type { SearchHit } from '@/core/search/types';

export interface SearchHighlightOverlayProps {
  pageNumber: number;
  scale: number;
  hits?: SearchHit[];
  activeHitId?: string | null;
  isVisible?: boolean;
  onSelectHit?: (hitId: string) => void;
}

export const SearchHighlightOverlay: React.FC<SearchHighlightOverlayProps> = ({
  pageNumber,
  scale,
  hits: propHits,
  activeHitId: propActiveHitId,
  isVisible: propIsVisible,
  onSelectHit: propOnSelectHit,
}) => {
  const storeState = useSearchStore(
    useShallow((state) => ({
      hits: state.hits,
      activeHitId: state.activeHitId,
      isVisible: state.isOverlayVisible,
    })),
  );

  const hits = propHits ?? storeState.hits;
  const activeHitId = propActiveHitId !== undefined ? propActiveHitId : storeState.activeHitId;
  const isVisible = propIsVisible !== undefined ? propIsVisible : storeState.isVisible;
  const onSelectHit = propOnSelectHit ?? useSearchStore.getState().setActiveHit;

  if (!isVisible || hits.length === 0) {
    return null;
  }

  const pageHits = hits.filter((hit) => hit.pageNumber === pageNumber);
  if (pageHits.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="search-highlight-overlay"
      className="absolute inset-0 pointer-events-none z-[14]"
      aria-hidden="true"
    >
      {pageHits.map((hit) => {
        const isActive = hit.id === activeHitId;
        return hit.rects.map((rect, index) => {
          const isPrimaryRect = index === 0;
          return (
            <div
              key={`search-hit-${hit.id}-${index}`}
              id={isActive && isPrimaryRect ? `search-hit-${hit.id}` : undefined}
              data-testid={isActive ? 'search-highlight-active' : 'search-highlight-inactive'}
              data-hit-id={hit.id}
              data-page-number={pageNumber}
              className={`absolute pointer-events-auto cursor-pointer rounded-[2px] transition-colors ${
                isActive
                  ? 'bg-orange-400/50 hover:bg-orange-400/60 ring-2 ring-orange-500 shadow-sm z-20 dark:bg-orange-400/40 dark:ring-orange-400'
                  : 'bg-amber-400/35 hover:bg-amber-400/50 border-b-2 border-amber-500/70 dark:bg-amber-400/25 dark:hover:bg-amber-400/40 dark:border-amber-400/80'
              }`}
              style={{
                left: rect.x * scale,
                top: rect.y * scale,
                width: Math.max(2, rect.width * scale),
                height: Math.max(2, rect.height * scale),
              }}
              title={hit.snippet || undefined}
              onClick={(event) => {
                event.stopPropagation();
                onSelectHit(hit.id);
              }}
            >
              {isActive && isPrimaryRect && (
                <span
                  data-testid="search-highlight-active-beacon"
                  className="absolute -inset-1 rounded-[4px] border border-orange-500/80 pointer-events-none opacity-40 animate-ping"
                />
              )}
            </div>
          );
        });
      })}
    </div>
  );
};

export default SearchHighlightOverlay;
