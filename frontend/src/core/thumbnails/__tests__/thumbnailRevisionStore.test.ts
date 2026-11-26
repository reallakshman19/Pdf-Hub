import { describe, it, expect, beforeEach } from 'vitest';
import { useThumbnailRevisionStore } from '../thumbnailRevisionStore';

describe('useThumbnailRevisionStore', () => {
  beforeEach(() => {
    useThumbnailRevisionStore.getState().resetRevisions();
  });

  it('initializes with empty revisions and zero global revision', () => {
    const state = useThumbnailRevisionStore.getState();
    expect(state.pageRevisions).toEqual({});
    expect(state.globalRevision).toBe(0);
    expect(state.getPageRevision(1)).toBe(0);
  });

  it('bumps page revision specifically for a target page', () => {
    useThumbnailRevisionStore.getState().bumpPageRevision(2);

    expect(useThumbnailRevisionStore.getState().pageRevisions[2]).toBe(1);
    expect(useThumbnailRevisionStore.getState().getPageRevision(2)).toBe(2); // 1 page + 1 global
    expect(useThumbnailRevisionStore.getState().getPageRevision(1)).toBe(1); // 0 page + 1 global
  });

  it('bumps global revision for all pages', () => {
    useThumbnailRevisionStore.getState().bumpPageRevision(3);
    useThumbnailRevisionStore.getState().bumpAllPageRevisions();

    expect(useThumbnailRevisionStore.getState().globalRevision).toBe(2);
    expect(useThumbnailRevisionStore.getState().getPageRevision(3)).toBe(3); // 1 page + 2 global
    expect(useThumbnailRevisionStore.getState().getPageRevision(1)).toBe(2); // 0 page + 2 global
  });

  it('resets all revisions cleanly', () => {
    useThumbnailRevisionStore.getState().bumpPageRevision(1);
    useThumbnailRevisionStore.getState().bumpAllPageRevisions();
    useThumbnailRevisionStore.getState().resetRevisions();

    expect(useThumbnailRevisionStore.getState().pageRevisions).toEqual({});
    expect(useThumbnailRevisionStore.getState().globalRevision).toBe(0);
  });
});
