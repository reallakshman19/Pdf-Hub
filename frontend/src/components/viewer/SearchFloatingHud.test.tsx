import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SearchFloatingHud } from './SearchFloatingHud';
import { useSearchStore } from '@/core/search/store';
import type { SearchHit } from '@/core/search/types';

function makeHit(id: string, pageNumber: number): SearchHit {
  return {
    id,
    pageNumber,
    snippet: `Snippet for ${id}`,
    rects: [{ x: 0, y: 0, width: 10, height: 10 }],
  };
}

describe('SearchFloatingHud', () => {
  it('returns null when query is empty', () => {
    useSearchStore.setState({
      query: '',
      hits: [],
      activeHitId: null,
    });
    const { container } = render(<SearchFloatingHud />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "No matches" when query is present but hits are empty', () => {
    useSearchStore.setState({
      query: 'missingword',
      hits: [],
      activeHitId: null,
    });
    render(<SearchFloatingHud />);

    expect(screen.getByTestId('search-floating-hud')).toBeInTheDocument();
    expect(screen.getByTestId('search-hud-query')).toHaveTextContent('missingword');
    expect(screen.getByTestId('search-hud-match-count')).toHaveTextContent('No matches');
    expect(screen.getByTestId('search-hud-prev')).toBeDisabled();
    expect(screen.getByTestId('search-hud-next')).toBeDisabled();
  });

  it('renders "X of Y" match count and triggers next/prev navigation', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const hits = [makeHit('hit-1', 1), makeHit('hit-2', 1), makeHit('hit-3', 2)];

    useSearchStore.setState({
      query: 'found',
      hits,
      activeHitId: 'hit-2',
    });

    render(<SearchFloatingHud onNext={onNext} onPrev={onPrev} />);

    expect(screen.getByTestId('search-hud-match-count')).toHaveTextContent('2 of 3');

    fireEvent.click(screen.getByTestId('search-hud-next'));
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('search-hud-prev'));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('toggles overlay visibility and handles close action', () => {
    const onClose = vi.fn();
    useSearchStore.setState({
      query: 'term',
      hits: [makeHit('hit-1', 1)],
      activeHitId: 'hit-1',
      isOverlayVisible: true,
    });

    render(<SearchFloatingHud onClose={onClose} />);

    const toggleBtn = screen.getByTestId('search-hud-visibility-toggle');
    expect(toggleBtn).toHaveAttribute('title', 'Hide highlights');

    fireEvent.click(toggleBtn);
    expect(useSearchStore.getState().isOverlayVisible).toBe(false);

    fireEvent.click(screen.getByTestId('search-hud-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
