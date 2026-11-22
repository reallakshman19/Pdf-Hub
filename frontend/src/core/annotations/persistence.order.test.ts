import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from './types';

const mocks = vi.hoisted(() => ({ openDB: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.openDB }));
import { loadAnnotationsOrNull, saveAnnotations } from './persistence';

const snapshot = (id: string) => [{ id }] as PdfAnnotation[];
const dbWithPut = (put: (record: { annotations: PdfAnnotation[] }) => Promise<void>) => ({
  transaction: () => ({ store: { put }, done: Promise.resolve() }),
  get: async () => undefined,
});

describe('annotation recovery persistence ordering', () => {
  beforeEach(() => vi.resetAllMocks());

  it('serializes same-document saves and waits for pending writes before loading', async () => {
    let release!: () => void;
    const firstOpen = new Promise<ReturnType<typeof dbWithPut>>((resolve) => {
      release = () => resolve(dbWithPut(async (record) => { written.push(record.annotations[0].id); }));
    });
    const written: string[] = [];
    mocks.openDB.mockImplementationOnce(() => firstOpen).mockImplementation(async () =>
      dbWithPut(async (record) => { written.push(record.annotations[0].id); }));
    const first = saveAnnotations('ordering-test', snapshot('old'));
    const second = saveAnnotations('ordering-test', snapshot('new'));
    const load = loadAnnotationsOrNull('ordering-test');
    await vi.waitFor(() => expect(mocks.openDB).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second, load]);
    expect(written).toEqual(['old', 'new']);
    expect(mocks.openDB).toHaveBeenCalledTimes(3);
  });

  it('allows a later save to recover after an earlier failure', async () => {
    const written: string[] = [];
    mocks.openDB.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(
      dbWithPut(async (record) => { written.push(record.annotations[0].id); }),
    );
    const first = saveAnnotations('recovery-test', snapshot('old'));
    const second = saveAnnotations('recovery-test', snapshot('new'));
    await expect(first).rejects.toThrow('Failed to save annotations');
    await expect(second).resolves.toBeUndefined();
    expect(written).toEqual(['new']);
  });
});
