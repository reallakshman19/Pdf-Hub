import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BatchRunResult } from './batchRunner';
import type { MacroOutputQueueItem } from './outputQueueStore';

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
}

export interface BatchCustodyAdapter {
  readonly persistent: boolean;
  loadOutputs(): Promise<MacroOutputQueueItem[]>;
  stageGroup(outputs: readonly MacroOutputQueueItem[]): Promise<void>;
  acknowledge(id: string): Promise<void>;
  clearOutputs(): Promise<void>;
  loadLatestReport(): Promise<BatchRunResult | null>;
  saveLatestReport(report: BatchRunResult): Promise<void>;
}

const DEFAULT_DB_NAME = 'pdf-hub-wp07-output-custody-v1';

function cloneRow(row: MacroOutputQueueItem): MacroOutputQueueItem {
  return { ...row, bytes: new Uint8Array(row.bytes) };
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

  constructor(private readonly dbName = DEFAULT_DB_NAME) {}

  private db(): Promise<IDBPDatabase<BatchCustodyDb>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<BatchCustodyDb>(this.dbName, 1, {
        upgrade(db) {
          const outputs = db.createObjectStore('outputs', { keyPath: 'id' });
          outputs.createIndex(
            'by-batch-occurrence',
            ['batchRunId', 'sourceInputIndex', 'sourceOutputIndex'],
            { unique: true },
          );
          db.createObjectStore('reports', { keyPath: 'key' });
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

  async acknowledge(id: string) {
    const db = await this.db();
    const tx = db.transaction('outputs', 'readwrite');
    await tx.store.delete(id);
    await tx.done;
  }

  async clearOutputs() {
    const db = await this.db();
    const tx = db.transaction('outputs', 'readwrite');
    await tx.store.clear();
    await tx.done;
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
    async acknowledge(id) { outputs.delete(id); },
    async clearOutputs() { outputs.clear(); },
    async loadLatestReport() { return report ? cloneReport(report) : null; },
    async saveLatestReport(value) { report = cloneReport(value); },
  };
}

export function createBestAvailableBatchCustodyAdapter(): BatchCustodyAdapter {
  return typeof indexedDB === 'undefined'
    ? createVolatileBatchCustodyAdapter()
    : new IndexedDbBatchCustodyAdapter();
}
