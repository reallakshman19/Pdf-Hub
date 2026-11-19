import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MacroOutputFile } from './types';
import type { BatchRunResult, BatchOutputArtifact } from './batchRunner';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import {
  createBestAvailableBatchCustodyAdapter,
  type BatchCustodyAdapter,
} from './durableBatchCustody';

/** WP-04 boundary: only batch outputs have a durable IndexedDB contract. */
export interface MacroOutputQueueItem extends MacroOutputFile {
  id: string;
  sourceKind?: 'macro' | 'generated' | 'batch';
  sourceDocumentKey?: string;
  sourceRecipeId?: string;
  sourceRecipeSha256?: string;
  sourceFileName?: string;
  sourceInputIndex?: number;
  sourceOutputIndex?: number;
  sourceOutputKind?: 'working-copy' | 'auxiliary';
  sourceOutputOriginalName?: string;
  sourceSha256?: string;
  outputSha256?: string;
  batchRunId?: string;
}

export type BatchCustodyStatus = 'uninitialized' | 'loading' | 'persistent'
  | 'volatile' | 'blocked';

type OutputChange =
  | MacroOutputQueueItem[]
  | ((current: MacroOutputQueueItem[]) => MacroOutputQueueItem[]);

export interface MacroOutputQueueState {
  outputs: MacroOutputQueueItem[];
  lastBatchReport: BatchRunResult | null;
  batchCustodyStatus: BatchCustodyStatus;
  batchCustodyError: string | null;
  /** Load persisted bytes only after independently checking their SHA-256. */
  hydrateBatchCustody: () => Promise<void>;
  /** Database transaction must finish before any output becomes visible. */
  enqueueBatchOutputs: (files: readonly BatchOutputArtifact[]) => Promise<string[]>;
  /** Delete persisted bytes first; only then acknowledge and hide in the UI. */
  acknowledgeBatchOutput: (id: string) => Promise<void>;
  clearAllOutputs: () => Promise<void>;
  saveBatchReport: (report: BatchRunResult) => Promise<void>;
  /** Legacy in-session setter; product batches use saveBatchReport. */
  setLastBatchReport: (report: BatchRunResult | null) => void;
  /** Legacy API cannot silently discard durable batch rows. */
  setOutputs: (change: OutputChange) => void;
  enqueueOutputs: (
    files: readonly MacroOutputFile[],
    provenance?: Pick<MacroOutputQueueItem,
      | 'sourceKind'
      | 'sourceDocumentKey'
      | 'sourceRecipeId'
      | 'sourceRecipeSha256'
      | 'sourceFileName'
      | 'sourceInputIndex'
      | 'sourceSha256'
      | 'outputSha256'
      | 'batchRunId'
    >,
  ) => string[];
  /** Memory-only clearing is intentionally unable to remove durable batch rows. */
  clearOutputs: () => void;
}

let batchCustody: BatchCustodyAdapter = createBestAvailableBatchCustodyAdapter();
let hydration: Promise<void> | null = null;

function validateRecoveredBatch(row: MacroOutputQueueItem): void {
  if (
    row.sourceKind !== 'batch'
    || !row.id
    || !row.name
    || !row.batchRunId
    || !Number.isSafeInteger(row.sourceInputIndex)
    || (row.sourceInputIndex ?? -1) < 0
    || !Number.isSafeInteger(row.sourceOutputIndex)
    || (row.sourceOutputIndex ?? -1) < 0
    || !/^sha256:[a-f0-9]{64}$/.test(row.outputSha256 ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(row.sourceSha256 ?? '')
    || !/^sha256:[a-f0-9]{64}$/.test(row.sourceRecipeSha256 ?? '')
    || !(row.bytes instanceof Uint8Array)
  ) {
    throw new Error('RECOVERY_IDENTITY_INVALID: batch output has invalid custody metadata.');
  }
}

function failCustody(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  useMacroOutputQueueStore.setState({
    batchCustodyStatus: 'blocked',
    batchCustodyError: message,
  });
  hydration = null;
  throw error;
}

async function hydrateCustody(): Promise<void> {
  const status = useMacroOutputQueueStore.getState().batchCustodyStatus;
  if (status === 'persistent' || status === 'volatile') return;
  if (status === 'blocked') {
    throw new Error(useMacroOutputQueueStore.getState().batchCustodyError ?? 'Output custody is blocked.');
  }
  if (!hydration) {
    hydration = (async () => {
      useMacroOutputQueueStore.setState({ batchCustodyStatus: 'loading', batchCustodyError: null });
      const [stored, report] = await Promise.all([
        batchCustody.loadOutputs(), batchCustody.loadLatestReport(),
      ]);
      const occurrences = new Set<string>();
      for (const row of stored) {
        validateRecoveredBatch(row);
        const occurrence = `${row.batchRunId}:${row.sourceInputIndex}:${row.sourceOutputIndex}`;
        if (occurrences.has(occurrence)) {
          throw new Error('RECOVERY_OCCURRENCE_DUPLICATED: two outputs have one custody identity.');
        }
        occurrences.add(occurrence);
        if (await FileAdapter.hashBytes(row.bytes) !== row.outputSha256) {
          throw new Error(`RECOVERY_OUTPUT_HASH_MISMATCH: ${row.name}`);
        }
      }
      useMacroOutputQueueStore.setState((state) => {
        const currentIds = new Set(state.outputs.map((item) => item.id));
        return {
          outputs: [
            ...stored.filter((item) => !currentIds.has(item.id)),
            ...state.outputs,
          ],
          lastBatchReport: state.lastBatchReport ?? report,
          batchCustodyStatus: batchCustody.persistent ? 'persistent' : 'volatile',
          batchCustodyError: null,
        };
      });
    })().catch(failCustody);
  }
  await hydration;
}

/** Allows isolated tests to use a fresh adapter without touching browser IDB. */
export function configureBatchCustodyAdapter(adapter: BatchCustodyAdapter): void {
  batchCustody = adapter;
  hydration = null;
  useMacroOutputQueueStore.setState({
    outputs: [],
    lastBatchReport: null,
    batchCustodyStatus: 'uninitialized',
    batchCustodyError: null,
  });
}

export const useMacroOutputQueueStore = create<MacroOutputQueueState>((set, get) => ({
  outputs: [],
  lastBatchReport: null,
  batchCustodyStatus: 'uninitialized',
  batchCustodyError: null,
  hydrateBatchCustody: hydrateCustody,
  setLastBatchReport: (report) => set({ lastBatchReport: report }),
  saveBatchReport: async (report) => {
    await hydrateCustody();
    try {
      await batchCustody.saveLatestReport(report);
      set({ lastBatchReport: report });
    } catch (error) {
      failCustody(error);
    }
  },
  setOutputs: (change) => set((state) => {
    const requested = typeof change === 'function' ? change(state.outputs) : change;
    const requestedIds = new Set(requested.map((item) => item.id));
    const retained = state.outputs.filter((item) =>
      item.sourceKind === 'batch' && !requestedIds.has(item.id),
    );
    return { outputs: [...requested, ...retained] };
  }),
  clearOutputs: () => set((state) => ({
    outputs: state.outputs.filter((row) => row.sourceKind === 'batch'),
  })),
  clearAllOutputs: async () => {
    await hydrateCustody();
    try {
      await batchCustody.clearOutputs();
      set({ outputs: [] });
    } catch (error) {
      failCustody(error);
    }
  },
  acknowledgeBatchOutput: async (id) => {
    await hydrateCustody();
    const row = get().outputs.find((item) => item.id === id);
    if (!row || row.sourceKind !== 'batch') return;
    try {
      await batchCustody.acknowledge(id);
      set((state) => ({ outputs: state.outputs.filter((item) => item.id !== id) }));
    } catch (error) {
      failCustody(error);
    }
  },
  enqueueBatchOutputs: async (files) => {
    if (!files.length) throw new Error('Batch output group has no PDFs.');
    await hydrateCustody();
    const first = files[0];
    const names = new Set<string>();
    const snapshots = files.map((item, index) => {
      if (
        item.outputIndex !== index
        || item.outputKind !== (index === 0 ? 'working-copy' : 'auxiliary')
        || item.batchRunId !== first.batchRunId
        || item.inputIndex !== first.inputIndex
        || item.sourceSha256 !== first.sourceSha256
        || item.recipeId !== first.recipeId
        || item.recipeSha256 !== first.recipeSha256
        || item.fileName !== first.fileName
        || !/^sha256:[a-f0-9]{64}$/.test(item.outputSha256)
        || !/^sha256:[a-f0-9]{64}$/.test(item.sourceSha256)
        || !/^sha256:[a-f0-9]{64}$/.test(item.recipeSha256)
        || !item.batchRunId.trim()
        || !item.outputName.trim()
        || names.has(item.outputName)
        || !(item.bytes instanceof Uint8Array)
      ) {
        throw new Error('Batch output group has inconsistent provenance or repeated identity.');
      }
      names.add(item.outputName);
      return { ...item, bytes: new Uint8Array(item.bytes) };
    });
    for (const item of snapshots) {
      if (await FileAdapter.hashBytes(item.bytes) !== item.outputSha256) {
        throw new Error(`Batch output SHA-256 mismatch for output #${item.outputIndex}.`);
      }
    }
    const queued: MacroOutputQueueItem[] = snapshots.map((item) => ({
      id: uuidv4(),
      name: item.outputName,
      bytes: item.bytes,
      sourceKind: 'batch' as const,
      sourceFileName: item.fileName,
      sourceInputIndex: item.inputIndex,
      sourceOutputIndex: item.outputIndex,
      sourceOutputKind: item.outputKind,
      sourceOutputOriginalName: item.originalOutputName,
      sourceSha256: item.sourceSha256,
      outputSha256: item.outputSha256,
      sourceRecipeId: item.recipeId,
      sourceRecipeSha256: item.recipeSha256,
      batchRunId: item.batchRunId,
    }));
    if (get().outputs.some((item) =>
      item.sourceKind === 'batch'
      && item.batchRunId === first.batchRunId
      && item.sourceInputIndex === first.inputIndex,
    )) {
      throw new Error('Batch output group is already staged in the queue.');
    }
    // IndexedDB transaction completes BEFORE publishing any output in memory.
    try {
      await batchCustody.stageGroup(queued);
    } catch (error) {
      failCustody(error);
    }
    set((state) => ({ outputs: [...state.outputs, ...queued] }));
    return queued.map((item) => item.id);
  },
  enqueueOutputs: (files, provenance = {}) => {
    const queued = files.map((file) => ({
      id: uuidv4(),
      name: file.name,
      bytes: new Uint8Array(file.bytes),
      ...provenance,
    }));
    if (queued.length > 0) {
      set((state) => ({ outputs: [...state.outputs, ...queued] }));
    }
    return queued.map((file) => file.id);
  },
}));
