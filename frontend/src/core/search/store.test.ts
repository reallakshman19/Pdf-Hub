import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchStore } from './store';
import type { SearchHit } from './types';

function makeHit(id: string, pageNumber: number): SearchHit {
  return {
    id,
    pageNumber,
    snippet: `hit-${id}`,
    rects: [{ x: 1, y: 2, width: 10, height: 8 }],
  };
}

describe('search store', () => {
  beforeEach(() => {
    useSearchStore.setState({
      query: '',
      isSearching: false,
      hits: [],
      activeHitId: null,
      error: null,
    });
  });

  it('resets hits and active id when query changes', () => {
    useSearchStore.setState({
      query: 'old',
      hits: [makeHit('a', 1)],
      activeHitId: 'a',
      isSearching: false,
      error: null,
    });

    useSearchStore.getState().setQuery('new');

    const state = useSearchStore.getState();
    expect(state.query).toBe('new');
    expect(state.hits).toEqual([]);
    expect(state.activeHitId).toBeNull();
  });

  it('preserves active hit when still present after setHits', () => {
    useSearchStore.setState({
      query: 'x',
      hits: [makeHit('a', 1)],
      activeHitId: 'a',
      isSearching: false,
      error: null,
    });

    useSearchStore.getState().setHits([makeHit('a', 1), makeHit('b', 2)]);
    expect(useSearchStore.getState().activeHitId).toBe('a');
  });

  it('sets first hit active when previous active hit is not present', () => {
    useSearchStore.setState({
      query: 'x',
      hits: [makeHit('a', 1)],
      activeHitId: 'a',
      isSearching: false,
      error: null,
    });

    useSearchStore.getState().setHits([makeHit('b', 2), makeHit('c', 3)]);
    expect(useSearchStore.getState().activeHitId).toBe('b');
  });

  it('nextHit cycles to first hit at the end', () => {
    useSearchStore.setState({
      query: 'x',
      hits: [makeHit('a', 1), makeHit('b', 2)],
      activeHitId: 'b',
      isSearching: false,
      error: null,
    });

    useSearchStore.getState().nextHit();
    expect(useSearchStore.getState().activeHitId).toBe('a');
  });

  it('prevHit cycles to last hit at the start', () => {
    useSearchStore.setState({
      query: 'x',
      hits: [makeHit('a', 1), makeHit('b', 2)],
      activeHitId: 'a',
      isSearching: false,
      error: null,
    });

    useSearchStore.getState().prevHit();
    expect(useSearchStore.getState().activeHitId).toBe('b');
  });

  it('setError updates the error message', () => {
    useSearchStore.getState().setError('network failed');
    expect(useSearchStore.getState().error).toBe('network failed');
  });

  it('clearSearch resets query, hits, active id, and error', () => {
    useSearchStore.setState({
      query: 'abc',
      hits: [makeHit('a', 1)],
      activeHitId: 'a',
      isSearching: true,
      error: 'oops',
    });

    useSearchStore.getState().clearSearch();
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.hits).toEqual([]);
    expect(state.activeHitId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isSearching).toBe(false);
  });
});
