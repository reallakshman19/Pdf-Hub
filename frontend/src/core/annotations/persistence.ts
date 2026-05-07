import { openDB } from 'idb';
import type { PdfAnnotation } from './types';
import { error, debug } from '@/core/logger/service';

const DB_NAME = 'DocCraftAnnotations';
const STORE_NAME = 'annotations';

export const getDb = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const saveAnnotations = async (
  documentKey: string,
  annotations: PdfAnnotation[],
): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.put({ id: documentKey, annotations });
    await tx.done;
    debug('annotation', 'Annotation store flushed to IndexedDB', {
      count: annotations.length,
      documentKey,
    });
  } catch (err) {
    error('annotation', 'Failed to save to IndexedDB', { error: String(err) });
  }
};

export const loadAnnotations = async (documentKey: string): Promise<PdfAnnotation[]> => {
  try {
    const db = await getDb();
    const result = await db.get(STORE_NAME, documentKey);
    return result ? (result.annotations as PdfAnnotation[]) : [];
  } catch (err) {
    error('annotation', 'Failed to load from IndexedDB', { error: String(err) });
    return [];
  }
};