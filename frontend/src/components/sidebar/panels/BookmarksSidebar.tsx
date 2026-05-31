import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { loadAppBookmarks, saveAppBookmarks } from '@/core/bookmarks/persistence';
import type { AppBookmark } from '@/core/bookmarks/types';

const BookmarksSidebar: React.FC = () => {
  const { workingBytes, documentKey, viewState, setPage } = useSessionStore();

  const [nativeBookmarks, setNativeBookmarks] = React.useState<
    Array<{ id: string; title: string; pageNumber: number | null; depth: number }>
  >([]);
  const [customBookmarks, setCustomBookmarks] = React.useState<AppBookmark[]>([]);
  const [title, setTitle] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!workingBytes) {
        setNativeBookmarks([]);
        return;
      }

      const doc = await PdfRendererAdapter.loadDocument(workingBytes);
      try {
        const outline = await PdfRendererAdapter.getOutlineFlat(doc);
        if (!cancelled) setNativeBookmarks(outline);
      } finally {
        await doc.destroy();
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [workingBytes]);

  React.useEffect(() => {
    const load = async () => {
      if (!documentKey) {
        setCustomBookmarks([]);
        return;
      }
      const bookmarks = await loadAppBookmarks(documentKey);
      setCustomBookmarks(bookmarks);
    };
    void load();
  }, [documentKey]);

  const persistCustomBookmarks = async (next: AppBookmark[]) => {
    setCustomBookmarks(next);
    if (documentKey) {
      await saveAppBookmarks(documentKey, next);
    }
  };

  const addBookmark = async () => {
    if (!documentKey) return;
    const next: AppBookmark = {
      id: uuidv4(),
      title: title.trim() || `Page ${viewState.currentPage}`,
      pageNumber: viewState.currentPage,
      createdAt: Date.now(),
    };
    await persistCustomBookmarks([...customBookmarks, next]);
    setTitle('');
  };

  const removeBookmark = async (id: string) => {
    await persistCustomBookmarks(customBookmarks.filter((bookmark) => bookmark.id !== id));
  };

  if (!workingBytes) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <Bookmark className="w-5 h-5" />
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Bookmarks</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Open a PDF to view outline and add app bookmarks.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-950">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Add bookmark for current page
        </div>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`Page ${viewState.currentPage}`}
          className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button size="sm" onClick={() => void addBookmark()}>
          <Plus className="w-4 h-4 mr-1" />
          Add Bookmark
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          My bookmarks
        </div>
        {customBookmarks.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            No custom bookmarks yet.
          </div>
        )}
        {customBookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 flex items-start justify-between gap-3"
          >
            <button
              className="text-left flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              onClick={() => setPage(bookmark.pageNumber)}
            >
              <div className="text-sm text-slate-800 dark:text-slate-100">{bookmark.title}</div>
              <div className="text-xs text-slate-500">Page {bookmark.pageNumber}</div>
            </button>
            <Button variant="ghost" size="icon" onClick={() => void removeBookmark(bookmark.id)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Native outline
        </div>
        {nativeBookmarks.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            No native outline/bookmarks found.
          </div>
        )}
        {nativeBookmarks.map((bookmark) => (
          <button
            key={bookmark.id}
            className="w-full text-left rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ paddingLeft: `${12 + bookmark.depth * 14}px` }}
            onClick={() => {
              if (bookmark.pageNumber) setPage(bookmark.pageNumber);
            }}
          >
            <div className="text-sm text-slate-800 dark:text-slate-100">{bookmark.title}</div>
            <div className="text-xs text-slate-500">
              {bookmark.pageNumber ? `Page ${bookmark.pageNumber}` : 'Destination unavailable'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BookmarksSidebar;
