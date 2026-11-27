import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkStore } from './store';
import { generateToc } from './tocGenerator';
import { loadAppBookmarks, saveAppBookmarks } from './persistence';

const mockRecords = new Map<string, unknown>();

vi.mock('idb', () => ({
  openDB: vi.fn(async (_name: string, _ver: number, opts?: { upgrade?: (db: { objectStoreNames: { contains: () => boolean }; createObjectStore: () => void }) => void }) => {
    opts?.upgrade?.({
      objectStoreNames: { contains: () => false },
      createObjectStore: vi.fn(),
    });
    return {
      get: vi.fn(async (_store: string, key: string) => mockRecords.get(key)),
      put: vi.fn(async (_store: string, value: { documentKey: string }) => {
        mockRecords.set(value.documentKey, value);
      }),
    };
  }),
}));

describe('core/bookmarks', () => {
  beforeEach(() => {
    mockRecords.clear();
  });

  it('manages bookmark tree CRUD and deep-cloned snapshots', () => {
    const store = new BookmarkStore();
    store.addBookmark(null, {
      id: 'b1',
      title: 'Intro',
      pageNumber: 1,
      children: [],
      source: 'manual',
    });
    store.addBookmark('b1', {
      id: 'b1-1',
      title: 'Scope',
      pageNumber: 2,
      children: [],
      source: 'manual',
    });
    store.updateBookmark('b1-1', { title: 'Scope Updated', pageNumber: 3, x: 10, y: 20 });

    const tree = store.getTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({ title: 'Scope Updated', pageNumber: 3, x: 10, y: 20 });

    // Returned snapshot is deep copied
    tree[0].children[0].title = 'Mutated Copy';
    expect(store.getTree()[0].children[0].title).toBe('Scope Updated');

    store.deleteBookmark('b1-1');
    expect(store.getTree()[0].children).toHaveLength(0);

    store.setTree(generateToc(['Chapter 1', 'Chapter 2'], 5));
    expect(store.getTree().map((n) => [n.title, n.pageNumber])).toEqual([
      ['Chapter 1', 5],
      ['Chapter 2', 6],
    ]);
  });

  it('persists and loads AppBookmarks via IndexedDB wrapper', async () => {
    await expect(loadAppBookmarks('doc-empty')).resolves.toEqual([]);
    const saved = [{ id: 'bm-1', title: 'Cover', pageNumber: 1, createdAt: 100 }];
    await saveAppBookmarks('doc-1', saved);
    await expect(loadAppBookmarks('doc-1')).resolves.toEqual(saved);
  });
});
