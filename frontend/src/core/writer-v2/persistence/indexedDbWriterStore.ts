import type { WriterElementV2 } from '../types';

export interface WriterAssetRecordV2 {
  id: string;
  documentFingerprint: string;
  kind: 'image';
  mimeType: string;
  dataUrl: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WriterDocumentRecordV2 {
  documentFingerprint: string;
  schemaVersion: 2;
  elements: WriterElementV2[];
  updatedAt: string;
}

export interface WriterPersistenceAdapterV2 {
  saveDocument: (record: WriterDocumentRecordV2) => Promise<void>;
  loadDocument: (documentFingerprint: string) => Promise<WriterDocumentRecordV2 | null>;
  deleteDocument: (documentFingerprint: string) => Promise<void>;

  saveAsset: (asset: WriterAssetRecordV2) => Promise<void>;
  loadAsset: (id: string) => Promise<WriterAssetRecordV2 | null>;
  listAssets: (documentFingerprint: string) => Promise<WriterAssetRecordV2[]>;
  deleteAsset: (id: string) => Promise<void>;
}

const DB_NAME = 'pdf-hub-writer-v2';
const DB_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const ASSET_STORE = 'assets';
const ASSET_DOCUMENT_INDEX = 'by-documentFingerprint';

export function createWriterDocumentRecord(
  documentFingerprint: string,
  elements: WriterElementV2[],
  updatedAt = new Date().toISOString(),
): WriterDocumentRecordV2 {
  return {
    documentFingerprint,
    schemaVersion: 2,
    elements: cloneElements(elements),
    updatedAt,
  };
}

export function createIndexedDbWriterPersistence(): WriterPersistenceAdapterV2 {
  return {
    async saveDocument(record) {
      const db = await openWriterDb();
      await put(db, DOCUMENT_STORE, {
        ...record,
        elements: cloneElements(record.elements),
      });
      db.close();
    },

    async loadDocument(documentFingerprint) {
      const db = await openWriterDb();
      const record = await get<WriterDocumentRecordV2>(
        db,
        DOCUMENT_STORE,
        documentFingerprint,
      );
      db.close();

      if (!record) return null;

      return {
        ...record,
        elements: cloneElements(record.elements),
      };
    },

    async deleteDocument(documentFingerprint) {
      const db = await openWriterDb();
      await del(db, DOCUMENT_STORE, documentFingerprint);
      db.close();
    },

    async saveAsset(asset) {
      const db = await openWriterDb();
      await put(db, ASSET_STORE, { ...asset });
      db.close();
    },

    async loadAsset(id) {
      const db = await openWriterDb();
      const asset = await get<WriterAssetRecordV2>(db, ASSET_STORE, id);
      db.close();
      return asset ? { ...asset } : null;
    },

    async listAssets(documentFingerprint) {
      const db = await openWriterDb();
      const assets = await getAllByIndex<WriterAssetRecordV2>(
        db,
        ASSET_STORE,
        ASSET_DOCUMENT_INDEX,
        documentFingerprint,
      );
      db.close();
      return assets.map((asset) => ({ ...asset }));
    },

    async deleteAsset(id) {
      const db = await openWriterDb();
      await del(db, ASSET_STORE, id);
      db.close();
    },
  };
}

/**
 * Test-safe fallback adapter.
 * Product code should use IndexedDB when available.
 */
export function createMemoryWriterPersistence(): WriterPersistenceAdapterV2 {
  const documents = new Map<string, WriterDocumentRecordV2>();
  const assets = new Map<string, WriterAssetRecordV2>();

  return {
    async saveDocument(record) {
      documents.set(record.documentFingerprint, {
        ...record,
        elements: cloneElements(record.elements),
      });
    },

    async loadDocument(documentFingerprint) {
      const record = documents.get(documentFingerprint);
      return record
        ? {
            ...record,
            elements: cloneElements(record.elements),
          }
        : null;
    },

    async deleteDocument(documentFingerprint) {
      documents.delete(documentFingerprint);
    },

    async saveAsset(asset) {
      assets.set(asset.id, { ...asset });
    },

    async loadAsset(id) {
      const asset = assets.get(id);
      return asset ? { ...asset } : null;
    },

    async listAssets(documentFingerprint) {
      return [...assets.values()]
        .filter((asset) => asset.documentFingerprint === documentFingerprint)
        .map((asset) => ({ ...asset }));
    },

    async deleteAsset(id) {
      assets.delete(id);
    },
  };
}

export function createBestAvailableWriterPersistence(): WriterPersistenceAdapterV2 {
  if (typeof indexedDB !== 'undefined') {
    return createIndexedDbWriterPersistence();
  }

  return createMemoryWriterPersistence();
}

function openWriterDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('IndexedDB is not available in this environment.'),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, {
          keyPath: 'documentFingerprint',
        });
      }

      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const assetStore = db.createObjectStore(ASSET_STORE, {
          keyPath: 'id',
        });

        assetStore.createIndex(ASSET_DOCUMENT_INDEX, 'documentFingerprint', {
          unique: false,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open writer-v2 IndexedDB.'));
  });
}

function put(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to put ${storeName}.`));
  });
}

function get<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error(`Failed to get ${storeName}.`));
  });
}

function del(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to delete ${storeName}.`));
  });
}

function getAllByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).index(indexName).getAll(key);
    request.onsuccess = () => resolve((request.result as T[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error(`Failed to query ${storeName}.`));
  });
}

function cloneElements(elements: WriterElementV2[]): WriterElementV2[] {
  return elements.map((element) => ({
    ...element,
    rect: { ...element.rect },
    style: { ...element.style },
    tableData: element.tableData
      ? {
          columns: element.tableData.columns.map((column) => ({ ...column })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        }
      : undefined,
  }));
}
