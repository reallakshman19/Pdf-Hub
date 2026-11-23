import { create } from 'zustand';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

export interface PageClipboardEntry {
  sourceDocumentKey: string;
  sourceFileName?: string;
  pageIndices: number[]; // 0-based
  isCut: boolean;
  serializedPagesBytes: Uint8Array;
}

export interface PageClipboardState {
  clipboard: PageClipboardEntry | null;
}

export interface PageClipboardActions {
  copyPages: (entry: Omit<PageClipboardEntry, 'isCut'>) => void;
  cutPages: (entry: Omit<PageClipboardEntry, 'isCut'>) => void;
  clearClipboard: () => void;
  syncClipboardFromStorage: () => Promise<void>;
}

export type PageClipboardStore = PageClipboardState & PageClipboardActions;

const BROADCAST_CHANNEL_NAME = 'pdfhub_page_clipboard_channel';
const DB_NAME = 'pdfhub_clipboard_db';
const STORE_NAME = 'clipboard_store';
const DB_VERSION = 1;

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (!event?.data) return;
        if (event.data.type === 'SET_CLIPBOARD' && event.data.entry) {
          usePageClipboardStore.setState({ clipboard: event.data.entry });
        } else if (event.data.type === 'CLEAR_CLIPBOARD') {
          usePageClipboardStore.setState({ clipboard: null });
        }
      };
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

function openClipboardDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function persistClipboardToIndexedDb(entry: PageClipboardEntry | null): Promise<void> {
  const db = await openClipboardDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (entry) {
        store.put({ key: 'active_entry', entry, timestamp: Date.now() });
      } else {
        store.delete('active_entry');
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadClipboardFromIndexedDb(): Promise<PageClipboardEntry | null> {
  const db = await openClipboardDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('active_entry');
      req.onsuccess = () => {
        if (req.result?.entry) {
          resolve(req.result.entry as PageClipboardEntry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const usePageClipboardStore = create<PageClipboardStore>((set) => ({
  clipboard: null,
  copyPages: (entry) => {
    const fullEntry: PageClipboardEntry = {
      ...entry,
      isCut: false,
    };
    set({ clipboard: fullEntry });
    getBroadcastChannel()?.postMessage({ type: 'SET_CLIPBOARD', entry: fullEntry });
    void persistClipboardToIndexedDb(fullEntry);
  },
  cutPages: (entry) => {
    const fullEntry: PageClipboardEntry = {
      ...entry,
      isCut: true,
    };
    set({ clipboard: fullEntry });
    getBroadcastChannel()?.postMessage({ type: 'SET_CLIPBOARD', entry: fullEntry });
    void persistClipboardToIndexedDb(fullEntry);
  },
  clearClipboard: () => {
    set({ clipboard: null });
    getBroadcastChannel()?.postMessage({ type: 'CLEAR_CLIPBOARD' });
    void persistClipboardToIndexedDb(null);
  },
  syncClipboardFromStorage: async () => {
    const entry = await loadClipboardFromIndexedDb();
    if (entry) {
      set({ clipboard: entry });
    }
  },
}));

// Initialize channel and load storage on startup
if (typeof window !== 'undefined') {
  getBroadcastChannel();
  void loadClipboardFromIndexedDb().then((entry) => {
    if (entry && !usePageClipboardStore.getState().clipboard) {
      usePageClipboardStore.setState({ clipboard: entry });
    }
  });
}

/**
 * Extracts and serializes selected page indices into an independent, standalone PDF.
 */
export async function serializeSelectedPagesToPdf(
  sourceBytes: Uint8Array,
  pageIndices: readonly number[],
): Promise<Uint8Array> {
  if (pageIndices.length === 0) {
    throw new Error('Cannot serialize empty page indices to PDF.');
  }

  const lib = await pdfLib();
  const sourceDoc = await lib.PDFDocument.load(sourceBytes);
  const bundleDoc = await lib.PDFDocument.create();

  const totalPages = sourceDoc.getPageCount();
  for (const pageIndex of pageIndices) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) {
      throw new Error(`Page index ${pageIndex} is out of bounds [0..${totalPages - 1}].`);
    }
  }

  const copiedPages = await bundleDoc.copyPages(sourceDoc, pageIndices as number[]);
  for (const page of copiedPages) {
    bundleDoc.addPage(page);
  }

  return bundleDoc.save();
}
