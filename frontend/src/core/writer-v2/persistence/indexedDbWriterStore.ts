import type { WriterElementV2, WriterTableCellStyle } from '../types';

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
  loadAsset: (id: string, documentFingerprint?: string) => Promise<WriterAssetRecordV2 | null>;
  listAssets: (documentFingerprint: string) => Promise<WriterAssetRecordV2[]>;
  deleteAsset: (id: string, documentFingerprint?: string) => Promise<void>;
}

const DB_NAME = 'pdf-hub-writer-v2';
const DB_VERSION = 2;
const DOCUMENT_STORE = 'documents';
const LEGACY_ASSET_STORE = 'assets';
const ASSET_STORE = 'assets-by-owner';
const ASSET_DOCUMENT_INDEX = 'by-documentFingerprint';
const ASSET_ID_INDEX = 'by-id';

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

    async loadAsset(id, documentFingerprint) {
      const db = await openWriterDb();
      try {
        const asset = documentFingerprint !== undefined
          ? await get<WriterAssetRecordV2>(db, ASSET_STORE, [documentFingerprint, id])
          : uniqueAsset(await getAllByIndex<WriterAssetRecordV2>(db, ASSET_STORE, ASSET_ID_INDEX, id));
        return asset ? { ...asset } : null;
      } finally { db.close(); }
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

    async deleteAsset(id, documentFingerprint) {
      const db = await openWriterDb();
      try {
        if (documentFingerprint !== undefined) await del(db, ASSET_STORE, [documentFingerprint, id]);
        else {
          // Compatibility only: unscoped operations cannot choose between owners.
          const asset = uniqueAsset(await getAllByIndex<WriterAssetRecordV2>(db, ASSET_STORE, ASSET_ID_INDEX, id));
          if (asset) await del(db, ASSET_STORE, [asset.documentFingerprint, id]);
        }
      } finally { db.close(); }
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
      assets.set(JSON.stringify([asset.documentFingerprint, asset.id]), { ...asset });
    },

    async loadAsset(id, documentFingerprint) {
      const asset = documentFingerprint !== undefined
        ? assets.get(JSON.stringify([documentFingerprint, id]))
        : uniqueAsset([...assets.values()].filter(asset => asset.id === id));
      return asset ? { ...asset } : null;
    },

    async listAssets(documentFingerprint) {
      return [...assets.values()]
        .filter((asset) => asset.documentFingerprint === documentFingerprint)
        .map((asset) => ({ ...asset }));
    },

    async deleteAsset(id, documentFingerprint) {
      const owner = documentFingerprint ?? uniqueAsset([...assets.values()].filter(asset => asset.id === id))?.documentFingerprint;
      if (owner !== undefined) assets.delete(JSON.stringify([owner, id]));
    },
  };
}

function uniqueAsset(assets: WriterAssetRecordV2[]): WriterAssetRecordV2 | null {
  if (assets.length > 1) throw new Error('Writer asset ID is ambiguous without its document owner.');
  return assets[0] ?? null;
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
          keyPath: ['documentFingerprint', 'id'],
        });
        assetStore.createIndex(ASSET_DOCUMENT_INDEX, 'documentFingerprint', { unique: false });
        assetStore.createIndex(ASSET_ID_INDEX, 'id', { unique: false });
        // IndexedDB upgrade is transactional: a failed migration rolls back the
        // version and all copied records. Retain the legacy store for recovery.
        if (db.objectStoreNames.contains(LEGACY_ASSET_STORE)) {
          const transaction = request.transaction!;
          const cursor = transaction.objectStore(LEGACY_ASSET_STORE).openCursor();
          cursor.onsuccess = () => {
            const record = cursor.result;
            if (!record) return;
            assetStore.put(record.value);
            record.continue();
          };
        }
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

function cloneCellStyle(style: WriterTableCellStyle): WriterTableCellStyle {
  return {
    ...style,
    borders: style.borders
      ? {
          top: style.borders.top ? { ...style.borders.top } : undefined,
          right: style.borders.right ? { ...style.borders.right } : undefined,
          bottom: style.borders.bottom ? { ...style.borders.bottom } : undefined,
          left: style.borders.left ? { ...style.borders.left } : undefined,
        }
      : undefined,
  };
}

function cloneElements(elements: WriterElementV2[]): WriterElementV2[] {
  return elements.map((element) => ({
    ...element,
    review: element.review ? { ...element.review } : undefined,
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    rect: { ...element.rect },
    style: { ...element.style },
    tableData: element.tableData
      ? {
          ...element.tableData,
          defaultCellStyle: element.tableData.defaultCellStyle
            ? cloneCellStyle(element.tableData.defaultCellStyle)
            : undefined,
          headerCellStyle: element.tableData.headerCellStyle
            ? cloneCellStyle(element.tableData.headerCellStyle)
            : undefined,
          columns: element.tableData.columns.map((column) => ({
            ...column,
            style: column.style ? cloneCellStyle(column.style) : undefined,
          })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              style: cell.style ? cloneCellStyle(cell.style) : undefined,
              mergedInto: cell.mergedInto ? { ...cell.mergedInto } : undefined,
            })),
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
