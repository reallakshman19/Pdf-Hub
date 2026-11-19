import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MacroOutputFile } from './types';
import type { BatchRunResult, BatchOutputArtifact } from './batchRunner';
import { FileAdapter } from '@/adapters/file/FileAdapter';

/**
 * Generated PDF bytes remain available in the browser session until the
 * user acknowledges their external save. This is explicitly NOT durable
 * offline persistence across reload or tab close.
 */
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

type OutputChange =
  | MacroOutputQueueItem[]
  | ((current: MacroOutputQueueItem[]) => MacroOutputQueueItem[]);

export interface MacroOutputQueueState {
  outputs: MacroOutputQueueItem[];
  /** Metadata-only report survives unmount/remount inside this tab/session. */
  lastBatchReport: BatchRunResult | null;
  setLastBatchReport: (report: BatchRunResult | null) => void;
  setOutputs: (change: OutputChange) => void;
  /** Validates every digest, then atomically enqueues the entire input's outputs. */
  enqueueBatchOutputs: (files: readonly BatchOutputArtifact[]) => Promise<string[]>;
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
  clearOutputs: () => void;
}

export const useMacroOutputQueueStore = create<MacroOutputQueueState>((set) => ({
  outputs: [],
  lastBatchReport: null,
  setLastBatchReport: (report) => set({ lastBatchReport: report }),
  setOutputs: (change) => set((state) => ({
    outputs: typeof change === 'function' ? change(state.outputs) : change,
  })),
  enqueueBatchOutputs: async (files) => {
    if (!files.length) throw new Error('Batch output group has no PDFs.');
    const first = files[0];
    const names = new Set<string>();
    const snapshots = files.map((item, i) => {
      if (
        item.outputIndex !== i
        || item.outputKind !== (i === 0 ? 'working-copy' : 'auxiliary')
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
    // No queue mutation is permitted before every source/output witness checks.
    for (const item of snapshots) {
      const digest = await FileAdapter.hashBytes(item.bytes);
      if (digest !== item.outputSha256) {
        throw new Error(`Batch output SHA-256 mismatch for output #${item.outputIndex}.`);
      }
    }
    const queued = snapshots.map((item) => ({
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
    set((state) => {
      const present = state.outputs.some((item) =>
        item.sourceKind === 'batch'
        && item.batchRunId === first.batchRunId
        && item.sourceInputIndex === first.inputIndex,
      );
      if (present) {
        throw new Error('Batch output group is already staged in the queue.');
      }
      return { outputs: [...state.outputs, ...queued] };
    });
    return queued.map((item) => item.id);
  },
  enqueueOutputs: (files, provenance = {}) => {
    const queued = files.map((file) => ({
      id: uuidv4(),
      name: file.name,
      // Snapshot for custody; producer mutation cannot change queued bytes.
      bytes: new Uint8Array(file.bytes),
      ...provenance,
    }));
    if (queued.length > 0) {
      set((state) => ({ outputs: [...state.outputs, ...queued] }));
    }
    return queued.map((file) => file.id);
  },
  clearOutputs: () => set({ outputs: [] }),
}));
