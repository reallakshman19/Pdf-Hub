import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { PdfAnnotation } from './types';
import { normalizeAnnotationReviews } from '@/core/review/annotationReview';
import { error, debug } from '@/core/logger/service';

const DB_NAME = 'DocCraftAnnotations';
const STORE_NAME = 'annotations';
const DB_VERSION = 1;
const ANNOTATION_SCHEMA_VERSION = 3;
// Opening IndexedDB is asynchronous, so transactions requested in order can
// otherwise start in the opposite order and replace newer recovery data.
const pendingWrites = new Map<string, Promise<void>>();

interface AnnotationRecord {
  id: string;
  annotations: PdfAnnotation[];
  updatedAt: number;
  schemaVersion?: number;
}

interface AnnotationDbSchema extends DBSchema {
  annotations: {
    key: string;
    value: AnnotationRecord;
  };
}

export class AnnotationPersistenceError extends Error {
  readonly cause?: unknown;
  readonly operation: 'load' | 'save';

  constructor(
    operation: 'load' | 'save',
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'AnnotationPersistenceError';
    this.operation = operation;
    this.cause = cause;
  }
}

export const getDb = async (): Promise<IDBPDatabase<AnnotationDbSchema>> => {
  return openDB<AnnotationDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const saveAnnotations = (
  documentKey: string,
  annotations: PdfAnnotation[],
): Promise<void> => {
  const previous = pendingWrites.get(documentKey) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(() => writeAnnotations(documentKey, annotations));
  pendingWrites.set(documentKey, write);
  void write.then(
    () => { if (pendingWrites.get(documentKey) === write) pendingWrites.delete(documentKey); },
    () => { if (pendingWrites.get(documentKey) === write) pendingWrites.delete(documentKey); },
  );
  return write;
};

const writeAnnotations = async (documentKey: string, annotations: PdfAnnotation[]): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await tx.store.put({
      id: documentKey,
      annotations,
      updatedAt: Date.now(),
      schemaVersion: ANNOTATION_SCHEMA_VERSION,
    });

    await tx.done;

    debug('annotation', 'Annotation store flushed to IndexedDB', {
      count: annotations.length,
      documentKey,
    });
  } catch (err) {
    error('annotation', 'Failed to save annotations to IndexedDB', {
      error: String(err),
      documentKey,
      count: annotations.length,
    });

    throw new AnnotationPersistenceError(
      'save',
      'Failed to save annotations to IndexedDB',
      err,
    );
  }
};

export const loadAnnotationsOrNull = async (
  documentKey: string,
): Promise<PdfAnnotation[] | null> => {
  try {
    await pendingWrites.get(documentKey);
    const db = await getDb();
    const result = await db.get(STORE_NAME, documentKey);

    const annotations = Array.isArray(result?.annotations)
      ? result.annotations
      : [];
    const schemaVersion = typeof result?.schemaVersion === 'number' ? result.schemaVersion : 1;

    debug('annotation', 'Annotation store loaded from IndexedDB', {
      count: annotations.length,
      documentKey,
      schemaVersion,
    });

    return result ? normalizeAnnotationReviews(annotations) : null;
  } catch (err) {
    error('annotation', 'Failed to load annotations from IndexedDB', {
      error: String(err),
      documentKey,
    });

    throw new AnnotationPersistenceError(
      'load',
      'Failed to load annotations from IndexedDB',
      err,
    );
  }
};

export const loadAnnotations = async (documentKey: string): Promise<PdfAnnotation[]> =>
  (await loadAnnotationsOrNull(documentKey)) ?? [];

export function isAnnotationPersistenceError(
  err: unknown,
): err is AnnotationPersistenceError {
  return err instanceof AnnotationPersistenceError;
}
