import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SearchHighlightOverlay } from './SearchHighlightOverlay';
import { useSearchStore } from '@/core/search/store';
import type { SearchHit } from '@/core/search/types';

function makeHit(id: string, pageNumber: number, rects = [{ x: 10, y: 20, width: 30, height: 12 }]): SearchHit {
  return {
    id,
    pageNumber,
    snippet: `Snippet for ${id}`,
    rects,
  };
}

describe('SearchHighlightOverlay', () => {
  it('returns null when isVisible is false', () => {
    const hits = [makeHit('hit-1', 1)];
    const { container } = render(
      <SearchHighlightOverlay
        pageNumber={1}
        scale={1}
        hits={hits}
        activeHitId="hit-1"
        isVisible={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when there are no hits for the given pageNumber', () => {
    const hits = [makeHit('hit-1', 2)];
    const { container } = render(
      <SearchHighlightOverlay
        pageNumber={1}
        scale={1}
        hits={hits}
        activeHitId="hit-1"
        isVisible={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders inactive and active highlights with scale applied to coordinates', () => {
    const hit1 = makeHit('hit-1', 1, [{ x: 10, y: 20, width: 40, height: 15 }]);
    const hit2 = makeHit('hit-2', 1, [{ x: 100, y: 120, width: 50, height: 18 }]);
    const onSelect = vi.fn();

    render(
      <SearchHighlightOverlay
        pageNumber={1}
        scale={1.5}
        hits={[hit1, hit2]}
        activeHitId="hit-2"
        isVisible={true}
        onSelectHit={onSelect}
      />,
    );

    const inactiveElements = screen.getAllByTestId('search-highlight-inactive');
    expect(inactiveElements).toHaveLength(1);
    expect(inactiveElements[0]).toHaveStyle({
      left: '15px',
      top: '30px',
      width: '60px',
      height: '22.5px',
    });

    const activeElements = screen.getAllByTestId('search-highlight-active');
    expect(activeElements).toHaveLength(1);
    expect(activeElements[0]).toHaveAttribute('id', 'search-hit-hit-2');
    expect(activeElements[0]).toHaveStyle({
      left: '150px',
      top: '180px',
      width: '75px',
      height: '27px',
    });

    // Active beacon
    expect(screen.getByTestId('search-highlight-active-beacon')).toBeInTheDocument();

    // Clicking inactive hit selects it
    fireEvent.click(inactiveElements[0]);
    expect(onSelect).toHaveBeenCalledWith('hit-1');
  });

  it('renders multi-rect hits correctly and only assigns id to the primary rect', () => {
    const multiRectHit = makeHit('hit-multi', 1, [
      { x: 10, y: 20, width: 30, height: 10 },
      { x: 10, y: 35, width: 40, height: 10 },
    ]);

    render(
      <SearchHighlightOverlay
        pageNumber={1}
        scale={1}
        hits={[multiRectHit]}
        activeHitId="hit-multi"
        isVisible={true}
      />,
    );

    const activeElements = screen.getAllByTestId('search-highlight-active');
    expect(activeElements).toHaveLength(2);
    expect(activeElements[0]).toHaveAttribute('id', 'search-hit-hit-multi');
    expect(activeElements[1]).not.toHaveAttribute('id');
  });

  it('falls back to useSearchStore state when optional props are omitted', () => {
    useSearchStore.setState({
      hits: [makeHit('store-hit-1', 1), makeHit('store-hit-2', 2)],
      activeHitId: 'store-hit-1',
      isOverlayVisible: true,
    });

    render(<SearchHighlightOverlay pageNumber={1} scale={1} />);

    expect(screen.getByTestId('search-highlight-active')).toBeInTheDocument();
    expect(screen.getByTestId('search-highlight-active')).toHaveAttribute('id', 'search-hit-store-hit-1');
  });
});
