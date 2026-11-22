import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from './types';

const mocks = vi.hoisted(() => ({ openDB: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.openDB }));

import {
  loadAnnotationSnapshotOrNull,
  loadAnnotationsOrNull,
  saveAnnotations,
} from './persistence';

const annotation = (id: string): PdfAnnotation => ({
  id,
  type: 'textbox',
  pageNumber: 1,
  rect: { x: 1, y: 2, width: 60, height: 20 },
  data: { text: id },
  createdAt: 1,
  updatedAt: 1,
});

type StoredRecord = {
  id: string;
  annotations: PdfAnnotation[];
  updatedAt: number;
  schemaVersion?: number;
  nativeSourceKeys?: string[];
};

describe('native annotation provenance persistence', () => {
  let records: Map<string, StoredRecord>;

  beforeEach(() => {
    vi.resetAllMocks();
    records = new Map();
    mocks.openDB.mockImplementation(async () => ({
      transaction: () => ({
        store: {
          get: async (id: string) => records.get(id),
          put: async (record: StoredRecord) => { records.set(record.id, record); },
        },
        done: Promise.resolve(),
      }),
      get: async (_store: string, id: string) => records.get(id),
    }));
  });

  it('retains the source baseline across later saves that omit the option', async () => {
    const key = 'native-provenance-preserved';
    const nativeKeys = ['[1,"10 0 R"]', '[1,"11 0 R"]'];
    await saveAnnotations(key, [annotation('a'), annotation('b')], {
      nativeSourceKeys: nativeKeys,
    });
    // User removed a native annotation; only the saved model changes.
    await saveAnnotations(key, [annotation('a')]);

    const snapshot = await loadAnnotationSnapshotOrNull(key);
    expect(snapshot?.nativeSourceKeys).toEqual(nativeKeys);
    expect(snapshot?.annotations.map((item) => item.id)).toEqual(['a']);
    expect((await loadAnnotationsOrNull(key))?.map((item) => item.id)).toEqual(['a']);
  });

  it('distinguishes legacy records without a baseline from new records', async () => {
    const key = 'native-provenance-legacy';
    records.set(key, {
      id: key,
      annotations: [annotation('a')],
      updatedAt: 1,
    });

    const snapshot = await loadAnnotationSnapshotOrNull(key);
    expect(snapshot?.nativeSourceKeys).toBeNull();
    expect(snapshot?.annotations).toHaveLength(1);
  });
});
