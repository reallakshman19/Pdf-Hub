/**
 * Supported OCR language pack definition.
 */
export interface OcrLanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  approxSizeMb: number;
}

/**
 * Standard supported language catalog for Tesseract.js in PDF Hub.
 */
export const SUPPORTED_OCR_LANGUAGES: readonly OcrLanguageInfo[] = [
  { code: 'eng', name: 'English', nativeName: 'English', script: 'Latin', approxSizeMb: 4.1 },
  { code: 'deu', name: 'German', nativeName: 'Deutsch', script: 'Latin', approxSizeMb: 3.2 },
  { code: 'fra', name: 'French', nativeName: 'Français', script: 'Latin', approxSizeMb: 2.8 },
  { code: 'spa', name: 'Spanish', nativeName: 'Español', script: 'Latin', approxSizeMb: 2.7 },
  { code: 'ita', name: 'Italian', nativeName: 'Italiano', script: 'Latin', approxSizeMb: 3.0 },
  { code: 'por', name: 'Portuguese', nativeName: 'Português', script: 'Latin', approxSizeMb: 2.9 },
  { code: 'rus', name: 'Russian', nativeName: 'Русский', script: 'Cyrillic', approxSizeMb: 4.8 },
  { code: 'chi_sim', name: 'Chinese (Simplified)', nativeName: '简体中文', script: 'CJK', approxSizeMb: 11.2 },
  { code: 'jpn', name: 'Japanese', nativeName: '日本語', script: 'CJK', approxSizeMb: 12.5 },
  { code: 'hin', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', approxSizeMb: 3.9 },
  { code: 'ara', name: 'Arabic', nativeName: 'العربية', script: 'Arabic', approxSizeMb: 2.4 },
] as const;

const DB_NAME = 'pdfhub-ocr-cache';
const STORE_NAME = 'language-models';
const DB_VERSION = 1;

/**
 * Opens or initializes the IndexedDB database for language model binary storage.
 */
function openLanguageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'code' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Checks whether a language model is cached in IndexedDB.
 */
export async function isLanguageCached(code: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;

  try {
    const db = await openLanguageDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(code);

      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Saves a downloaded language model buffer to IndexedDB for offline use.
 */
export async function cacheLanguageModel(
  code: string,
  data: Uint8Array,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const db = await openLanguageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({
      code,
      data,
      cachedAt: new Date().toISOString(),
      sizeBytes: data.byteLength,
    });

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves all currently cached language codes from IndexedDB.
 */
export async function getCachedLanguageCodes(): Promise<string[]> {
  if (typeof indexedDB === 'undefined') return [];

  try {
    const db = await openLanguageDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();

      req.onsuccess = () => resolve((req.result as string[]) ?? []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Deletes a cached language model from IndexedDB.
 */
export async function deleteCachedLanguageModel(code: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const db = await openLanguageDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(code);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Resolves combined multi-language hint array from primary and secondary selections.
 * Guarantees primary code is at index 0 and no duplicates exist.
 */
export function buildMultiLanguageHints(
  primaryCode: string,
  secondaryCodes: string[] = [],
): string[] {
  const primary = (primaryCode || 'eng').trim();
  const set = new Set<string>([primary]);

  secondaryCodes.forEach((sec) => {
    const trimmed = sec?.trim();
    if (trimmed && trimmed !== primary) {
      set.add(trimmed);
    }
  });

  return Array.from(set);
}

/**
 * Finds language info from catalog by code.
 */
export function getLanguageInfo(code: string): OcrLanguageInfo | undefined {
  return SUPPORTED_OCR_LANGUAGES.find((lang) => lang.code === code);
}
