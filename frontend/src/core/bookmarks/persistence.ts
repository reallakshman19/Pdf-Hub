import { openDB } from 'idb';
import type { AppBookmark } from './types';

const DB_NAME = 'DocCraftBookmarks';
const STORE_NAME = 'bookmarks';

export const getBookmarksDb = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'documentKey' });
      }
    },
  });
};

export const loadAppBookmarks = async (documentKey: string): Promise<AppBookmark[]> => {
  const db = await getBookmarksDb();
  const record = await db.get(STORE_NAME, documentKey);
  return Array.isArray(record?.bookmarks) ? (record.bookmarks as AppBookmark[]) : [];
};

export const saveAppBookmarks = async (
  documentKey: string,
  bookmarks: AppBookmark[],
): Promise<void> => {
  const db = await getBookmarksDb();
  await db.put(STORE_NAME, { documentKey, bookmarks });
};