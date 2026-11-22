import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { PdfAnnotation } from './types';
import {
  isValidNativeDeletionTombstone,
  type NativeDeletionTombstone,
} from './nativeIntegrity';
import { normalizeAnnotationReviews } from '@/core/review/annotationReview';
import { error, debug } from '@/core/logger/service';

const DB_NAME = 'DocCraftAnnotations';
const STORE_NAME = 'annotations';
const DB_VERSION = 1;
const ANNOTATION_SCHEMA_VERSION = 4;
// Opening IndexedDB is asynchronous, so transactions requested in order can
// otherwise start in the opposite order and replace newer recovery data.
const pendingWrites = new Map<string, Promise<void>>();

interface AnnotationRecord {
  id: string;
  annotations: PdfAnnotation[];
  updatedAt: number;
  schemaVersion?: number;
  /** Native annotation identities observed in the PDF during the last hydration. */
  nativeSourceKeys?: string[];
  /** Only explicit deletion commands may authorize native object removal. */
  nativeDeletionTombstones?: NativeDeletionTombstone[];
}

export interface AnnotationSnapshot {
  annotations: PdfAnnotation[];
  /** Legacy source baseline is diagnostic only, never deletion authorization. */
  nativeSourceKeys: string[] | null;
  nativeDeletionTombstones?: NativeDeletionTombstone[];
}

export interface SaveAnnotationOptions {
  /** The complete set of native annotation identities present in the opened PDF. */
  nativeSourceKeys?: string[];
  nativeDeletionTombstones?: NativeDeletionTombstone[];
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
  options: SaveAnnotationOptions = {},
): Promise<void> => {
  const previous = pendingWrites.get(documentKey) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(() => writeAnnotations(documentKey, annotations, options));
  pendingWrites.set(documentKey, write);
  void write.then(
    () => { if (pendingWrites.get(documentKey) === write) pendingWrites.delete(documentKey); },
    () => { if (pendingWrites.get(documentKey) === write) pendingWrites.delete(documentKey); },
  );
  return write;
};

const writeAnnotations = async (
  documentKey: string,
  annotations: PdfAnnotation[],
  options: SaveAnnotationOptions,
): Promise<void> => {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    // Other save paths (history, toolbar, autosave) must not erase the native
    // deletion baseline established during source hydration.
    const previous = await tx.store.get(documentKey);
    const nativeSourceKeys = options.nativeSourceKeys ?? previous?.nativeSourceKeys;
    const tombstones = options.nativeDeletionTombstones
      ?? previous?.nativeDeletionTombstones ?? [];
    if (!Array.isArray(tombstones) || !tombstones.every(isValidNativeDeletionTombstone)) {
      throw new Error('Cannot safely persist invalid native deletion commands.');
    }

    await tx.store.put({
      id: documentKey,
      annotations,
      updatedAt: Date.now(),
      schemaVersion: ANNOTATION_SCHEMA_VERSION,
      ...(nativeSourceKeys ? { nativeSourceKeys } : {}),
      nativeDeletionTombstones: tombstones,
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

export const loadAnnotationSnapshotOrNull = async (
  documentKey: string,
): Promise<AnnotationSnapshot | null> => {
  try {
    await pendingWrites.get(documentKey);
    const db = await getDb();
    const result = await db.get(STORE_NAME, documentKey);

    // A malformed recovery record is not an empty cache. An empty cache
    // otherwise risks being interpreted as permission to delete PDF objects.
    if (result && !Array.isArray(result.annotations)) {
      throw new Error('Corrupted annotation snapshot: annotations is not an array.');
    }
    const tombstones = result?.nativeDeletionTombstones;
    if (tombstones !== undefined && (!Array.isArray(tombstones)
      || !tombstones.every(isValidNativeDeletionTombstone))) {
      throw new Error('Corrupted annotation snapshot: invalid native deletion commands.');
    }
    const annotations = result?.annotations ?? [];
    const schemaVersion = typeof result?.schemaVersion === 'number' ? result.schemaVersion : 1;

    debug('annotation', 'Annotation store loaded from IndexedDB', {
      count: annotations.length,
      documentKey,
      schemaVersion,
    });

    return result ? {
      annotations: normalizeAnnotationReviews(annotations),
      nativeSourceKeys: Array.isArray(result.nativeSourceKeys)
        && result.nativeSourceKeys.every((key) => typeof key === 'string')
        ? result.nativeSourceKeys
        : null,
      nativeDeletionTombstones: tombstones ?? [],
    } : null;
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

export const loadAnnotationsOrNull = async (documentKey: string): Promise<PdfAnnotation[] | null> =>
  (await loadAnnotationSnapshotOrNull(documentKey))?.annotations ?? null;

export const loadAnnotations = async (documentKey: string): Promise<PdfAnnotation[]> =>
  (await loadAnnotationsOrNull(documentKey)) ?? [];

export function isAnnotationPersistenceError(
  err: unknown,
): err is AnnotationPersistenceError {
  return err instanceof AnnotationPersistenceError;
}
