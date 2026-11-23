import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SUPPORTED_OCR_LANGUAGES,
  buildMultiLanguageHints,
  getLanguageInfo,
  cacheLanguageModel,
  isLanguageCached,
  getCachedLanguageCodes,
  deleteCachedLanguageModel,
} from '../ocrLanguageManager';

// Simple in-memory mock for indexedDB in unit test environment
class MockIDBDatabase {
  private data = new Map<string, unknown>();

  transaction(_storeName: string, _mode: string) {
    const dataMap = this.data;
    return {
      objectStore: () => ({
        get: (key: string) => {
          const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
          setTimeout(() => {
            req.result = dataMap.get(key);
            req.onsuccess?.();
          }, 0);
          return req;
        },
        put: (value: { code: string; [k: string]: unknown }) => {
          const req: { onsuccess?: () => void; onerror?: () => void } = {};
          setTimeout(() => {
            dataMap.set(value.code, value);
            req.onsuccess?.();
          }, 0);
          return req;
        },
        getAllKeys: () => {
          const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
          setTimeout(() => {
            req.result = Array.from(dataMap.keys());
            req.onsuccess?.();
          }, 0);
          return req;
        },
        delete: (key: string) => {
          const req: { onsuccess?: () => void; onerror?: () => void } = {};
          setTimeout(() => {
            dataMap.delete(key);
            req.onsuccess?.();
          }, 0);
          return req;
        },
      }),
    };
  }
}

const mockDb = new MockIDBDatabase();

const mockIndexedDB = {
  open: vi.fn().mockImplementation(() => {
    const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = {};
    setTimeout(() => {
      req.result = mockDb;
      req.onsuccess?.();
    }, 0);
    return req;
  }),
};

describe('ocrLanguageManager', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', mockIndexedDB);
    const codes = await getCachedLanguageCodes();
    for (const code of codes) {
      await deleteCachedLanguageModel(code);
    }
  });

  it('contains expected core languages in catalog', () => {
    const codes = SUPPORTED_OCR_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('eng');
    expect(codes).toContain('deu');
    expect(codes).toContain('fra');
    expect(codes).toContain('spa');
    expect(codes).toContain('hin');
    expect(codes).toContain('chi_sim');
    expect(codes).toContain('jpn');
  });

  it('finds language info by code', () => {
    const info = getLanguageInfo('deu');
    expect(info).toBeDefined();
    expect(info?.name).toBe('German');
    expect(info?.nativeName).toBe('Deutsch');
  });

  it('builds multi-language hints avoiding duplicates and preserving primary position', () => {
    const hints = buildMultiLanguageHints('eng', ['deu', 'eng', 'fra']);
    expect(hints).toEqual(['eng', 'deu', 'fra']);
  });

  it('defaults to eng when primary is blank', () => {
    const hints = buildMultiLanguageHints('', ['deu']);
    expect(hints).toEqual(['eng', 'deu']);
  });

  it('caches, detects, lists, and deletes language model in IndexedDB', async () => {
    expect(await isLanguageCached('deu')).toBe(false);

    const dummyModel = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
    await cacheLanguageModel('deu', dummyModel);

    expect(await isLanguageCached('deu')).toBe(true);

    const cachedList = await getCachedLanguageCodes();
    expect(cachedList).toContain('deu');

    await deleteCachedLanguageModel('deu');
    expect(await isLanguageCached('deu')).toBe(false);
  });
});
