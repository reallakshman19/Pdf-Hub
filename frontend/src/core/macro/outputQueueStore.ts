import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MacroOutputFile } from './types';

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
  sourceSha256?: string;
  outputSha256?: string;
  batchRunId?: string;
}

type OutputChange =
  | MacroOutputQueueItem[]
  | ((current: MacroOutputQueueItem[]) => MacroOutputQueueItem[]);

export interface MacroOutputQueueState {
  outputs: MacroOutputQueueItem[];
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
  clearOutputs: () => void;
}

export const useMacroOutputQueueStore = create<MacroOutputQueueState>((set) => ({
  outputs: [],
  setOutputs: (change) => set((state) => ({
    outputs: typeof change === 'function' ? change(state.outputs) : change,
  })),
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
