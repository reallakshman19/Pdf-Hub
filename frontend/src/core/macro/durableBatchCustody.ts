import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BatchRunResult } from './batchRunner';
import type { MacroOutputQueueItem } from './outputQueueStore';

export type BatchReceiptMethod = 'native-readback-verified' | 'browser-user-confirmed' | 'discarded-without-receipt';

export interface BatchOutputReceipt {
  readonly id: string;
  readonly batchRunId: string;
  readonly sourceInputIndex: number;
  readonly sourceOutputIndex: number;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly outputName: string;
  readonly method: BatchReceiptMethod;
  readonly recordedAt: string;
  /** File name only; browser APIs do not disclose an authoritative full path. */
  readonly externalFileName?: string;
  /** Present only for verified native File System Access readbacks. */
  readonly readbackSha256?: string;
}

/**
 * WP-07 / WP-04 boundary: independent, versioned output custody store.
 * No source PDF admission state, document history or Writer DB is changed.
 *
 * Every group commit is one IndexedDB transaction. Successful IDB transaction
 * completion proves only browser-origin storage, never external disk receipt.
 */
interface BatchCustodyDb extends DBSchema {
  outputs: {
    key: string;
    value: MacroOutputQueueItem;
    indexes: { 'by-batch-occurrence': [string, number, number] };
  };
  reports: {
    key: string;
    value: { key: string; report: BatchRunResult };
  };
  receipts: {
    key: string;
    value: BatchOutputReceipt;
  };
}

export interface BatchCustodyAdapter {
  readonly persistent: boolean;
  loadOutputs(): Promise<MacroOutputQueueItem[]>;
  stageGroup(outputs: readonly MacroOutputQueueItem[]): Promise<void>;
  acknowledge(id: string, receipt: BatchOutputReceipt): Promise<void>;
  discardOutputs(receipts: readonly BatchOutputReceipt[]): Promise<void>;
  loadReceipts(): Promise<BatchOutputReceipt[]>;
  loadLatestReport(): Promise<BatchRunResult | null>;
  saveLatestReport(report: BatchRunResult): Promise<void>;
}

const DEFAULT_DB_NAME = 'pdf-hub-wp07-output-custody-v1';

function cloneRow(row: MacroOutputQueueItem): MacroOutputQueueItem {
  return { ...row, bytes: new Uint8Array(row.bytes) };
}

function assertReceiptMatchesRow(row: MacroOutputQueueItem | undefined, receipt: BatchOutputReceipt): void {
  if (!row || row.sourceKind !== 'batch'
    || row.id !== receipt.id
    || row.batchRunId !== receipt.batchRunId
    || row.sourceInputIndex !== receipt.sourceInputIndex
    || row.sourceOutputIndex !== receipt.sourceOutputIndex
    || row.sourceSha256 !== receipt.sourceSha256
    || row.outputSha256 !== receipt.outputSha256
    || row.name !== receipt.outputName
    || !Number.isFinite(Date.parse(receipt.recordedAt))
    || (receipt.method === 'native-readback-verified'
      && receipt.readbackSha256 !== receipt.outputSha256)
    || (receipt.method !== 'native-readback-verified' && receipt.readbackSha256 !== undefined)
  ) {
    throw new Error('BATCH_RECEIPT_IDENTITY_INVALID: receipt does not match stored output.');
  }
}

function cloneReport(report: BatchRunResult): BatchRunResult {
  return JSON.parse(JSON.stringify(report)) as BatchRunResult;
}

function assertBatchRows(rows: readonly MacroOutputQueueItem[]): void {
  if (!rows.length) throw new Error('Cannot persist an empty batch group.');
  const first = rows[0];
  for (const [index, row] of rows.entries()) {
    if (
      row.sourceKind !== 'batch'
      || row.batchRunId !== first.batchRunId
      || row.sourceInputIndex !== first.sourceInputIndex
      || row.sourceOutputIndex !== index
      || !row.id || !row.name
      || !(row.bytes instanceof Uint8Array)
      || !/^sha256:[a-f0-9]{64}$/.test(row.outputSha256 ?? '')
    ) {
      throw new Error('Invalid durable batch group identity.');
    }
  }
}

export class IndexedDbBatchCustodyAdapter implements BatchCustodyAdapter {
  readonly persistent = true;
  private dbPromise: Promise<IDBPDatabase<BatchCustodyDb>> | null = null;
  private readonly dbName: string;

  constructor(dbName = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  private db(): Promise<IDBPDatabase<BatchCustodyDb>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<BatchCustodyDb>(this.dbName, 2, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            const outputs = db.createObjectStore('outputs', { keyPath: 'id' });
            outputs.createIndex(
              'by-batch-occurrence',
              ['batchRunId', 'sourceInputIndex', 'sourceOutputIndex'],
              { unique: true },
            );
            db.createObjectStore('reports', { keyPath: 'key' });
          }
          // Upgrade v1 without deleting any queued PDFs or report metadata.
          if (oldVersion < 2) db.createObjectStore('receipts', { keyPath: 'id' });
        },
      });
      this.dbPromise.catch(() => { this.dbPromise = null; });
    }
    return this.dbPromise;
  }

  async loadOutputs() {
    const db = await this.db();
    return (await db.getAll('outputs')).map(cloneRow);
  }

  async stageGroup(rows: readonly MacroOutputQueueItem[]) {
    assertBatchRows(rows);
    const db = await this.db();
    const tx = db.transaction('outputs', 'readwrite');
    try {
      for (const row of rows) {
        await tx.store.add(cloneRow(row));
      }
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* IDB may already have aborted. */ }
      throw error;
    }
  }

  async acknowledge(id: string, receipt: BatchOutputReceipt) {
    const db = await this.db();
    const tx = db.transaction(['outputs', 'receipts'], 'readwrite');
    try {
      const row = await tx.objectStore('outputs').get(id);
      assertReceiptMatchesRow(row, receipt);
      await tx.objectStore('receipts').add(receipt);
      await tx.objectStore('outputs').delete(id);
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already rolled back. */ }
      throw error;
    }
  }

  async discardOutputs(receipts: readonly BatchOutputReceipt[]) {
    const db = await this.db();
    const tx = db.transaction(['outputs', 'receipts'], 'readwrite');
    try {
      for (const receipt of receipts) {
        if (receipt.method !== 'discarded-without-receipt') {
          throw new Error('BATCH_DISCARD_METHOD_INVALID');
        }
        const row = await tx.objectStore('outputs').get(receipt.id);
        assertReceiptMatchesRow(row, receipt);
        await tx.objectStore('receipts').add(receipt);
        await tx.objectStore('outputs').delete(receipt.id);
      }
      await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already rolled back. */ }
      throw error;
    }
  }

  async loadReceipts() {
    const db = await this.db();
    return db.getAll('receipts');
  }

  async loadLatestReport() {
    const db = await this.db();
    const row = await db.get('reports', 'latest');
    return row ? cloneReport(row.report) : null;
  }

  async saveLatestReport(report: BatchRunResult) {
    const db = await this.db();
    const tx = db.transaction('reports', 'readwrite');
    await tx.store.put({ key: 'latest', report: cloneReport(report) });
    await tx.done;
  }
}

/** Test-only and non-IDB environment: explicitly volatile, never 'durable'. */
export function createVolatileBatchCustodyAdapter(): BatchCustodyAdapter {
  const outputs = new Map<string, MacroOutputQueueItem>();
  const receipts = new Map<string, BatchOutputReceipt>();
  let report: BatchRunResult | null = null;
  return {
    persistent: false,
    async loadOutputs() { return [...outputs.values()].map(cloneRow); },
    async stageGroup(rows) {
      assertBatchRows(rows);
      for (const row of rows) {
        if ([...outputs.values()].some((item) =>
          item.batchRunId === row.batchRunId
          && item.sourceInputIndex === row.sourceInputIndex
          && item.sourceOutputIndex === row.sourceOutputIndex)) {
          throw new Error('Duplicate durable batch occurrence.');
        }
      }
      for (const row of rows) outputs.set(row.id, cloneRow(row));
    },
    async acknowledge(id, receipt) {
      assertReceiptMatchesRow(outputs.get(id), receipt);
      if (receipts.has(id)) throw new Error('BATCH_RECEIPT_DUPLICATE');
      receipts.set(id, { ...receipt });
      outputs.delete(id);
    },
    async discardOutputs(discarded) {
      for (const receipt of discarded) {
        if (receipt.method !== 'discarded-without-receipt') throw new Error('BATCH_DISCARD_METHOD_INVALID');
        assertReceiptMatchesRow(outputs.get(receipt.id), receipt);
        if (receipts.has(receipt.id)) throw new Error('BATCH_RECEIPT_DUPLICATE');
      }
      for (const receipt of discarded) {
        receipts.set(receipt.id, { ...receipt });
        outputs.delete(receipt.id);
      }
    },
    async loadReceipts() { return [...receipts.values()].map((receipt) => ({ ...receipt })); },
    async loadLatestReport() { return report ? cloneReport(report) : null; },
    async saveLatestReport(value) { report = cloneReport(value); },
  };
}

export function createBestAvailableBatchCustodyAdapter(): BatchCustodyAdapter {
  return typeof indexedDB === 'undefined'
    ? createVolatileBatchCustodyAdapter()
    : new IndexedDbBatchCustodyAdapter();
}
