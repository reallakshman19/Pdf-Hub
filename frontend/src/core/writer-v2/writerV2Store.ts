import { create } from 'zustand';
import {
  createInitialWriterV2State,
  executeWriterCommand,
  getVisibleWriterElements,
  redoWriterCommand,
  undoWriterCommand,
  type WriterV2CommandResult,
  type WriterV2State,
} from './writerCommandStore';
import type { WriterCommand } from './writerCommands';
import type { WriterElementV2 } from './types';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import { normalizeWriterToolForRichAuthoring } from './writerToolPolicy';

export type WriterV2Tool =
  | 'select'
  | 'richTextBox'
  | 'textCallout'
  | 'textStamp'
  | 'reviewLabel'
  | 'richNote'
  | 'tableBox'
  | 'selectBoxCopy';

export interface WriterV2StoreState extends WriterV2State {
  activeWriterTool: WriterV2Tool;
  setActiveWriterTool: (tool: WriterV2Tool) => void;

  editingId: string | null;
  currentDocumentFingerprint: string | null;
  assetRecords: WriterAssetRecordV2[];
  lastPersistedAt: string | null;

  dispatchWriterCommand: (command: WriterCommand) => WriterV2CommandResult;
  undoWriter: () => WriterV2CommandResult;
  redoWriter: () => WriterV2CommandResult;

  beginEditingWriterElement: (id: string) => void;
  endEditingWriterElement: () => void;

  addWriterAssets: (assets: WriterAssetRecordV2[]) => void;
  removeWriterAsset: (assetId: string) => void;

  hydrateWriterElements: (elements: WriterElementV2[]) => void;
  hydrateWriterSession: (input: {
    documentFingerprint: string;
    elements: WriterElementV2[];
    assetRecords?: WriterAssetRecordV2[];
    persistedAt?: string | null;
  }) => void;

  markWriterPersisted: (persistedAt?: string) => void;
  clearWriterV2: () => void;
}

export const useWriterV2Store = create<WriterV2StoreState>((set, get) => ({
  ...createInitialWriterV2State(),
  activeWriterTool: 'select',
  editingId: null,
  currentDocumentFingerprint: null,
  assetRecords: [],
  lastPersistedAt: null,

  setActiveWriterTool: (activeWriterTool) => {
    set({
      activeWriterTool: normalizeWriterToolForRichAuthoring(activeWriterTool),
    });
  },

  dispatchWriterCommand: (command) => {
    const previousEditingId = get().editingId;
    const result = executeWriterCommand(get(), command);

    set(applyCommandStateToStore(result.state, get(), {
      editingId: command.type === 'DELETE_WRITER_ELEMENT'
        && previousEditingId === command.id
          ? null
          : previousEditingId,
    }));

    return result;
  },

  undoWriter: () => {
    const result = undoWriterCommand(get());
    set(applyCommandStateToStore(result.state, get(), { editingId: null }));
    return result;
  },

  redoWriter: () => {
    const result = redoWriterCommand(get());
    set(applyCommandStateToStore(result.state, get(), { editingId: null }));
    return result;
  },

  beginEditingWriterElement: (id) => {
    const target = get().elements.find((element) => element.id === id);

    if (!target || target.locked || target.hidden) {
      set({ editingId: null });
      return;
    }

    set({
      editingId: id,
      selectedIds: [id],
      activeId: id,
    });
  },

  endEditingWriterElement: () => {
    set({ editingId: null });
  },

  addWriterAssets: (assets) => {
    if (assets.length === 0) return;

    const existing = new Map(get().assetRecords.map((asset) => [asset.id, asset]));

    for (const asset of assets) {
      existing.set(asset.id, { ...asset });
    }

    set({
      assetRecords: [...existing.values()],
      dirty: true,
    });
  },

  removeWriterAsset: (assetId) => {
    set({
      assetRecords: get().assetRecords.filter((asset) => asset.id !== assetId),
      dirty: true,
    });
  },

  hydrateWriterElements: (elements) => {
    set({
      ...createInitialWriterV2State({
        elements,
      }),
      dirty: false,
      editingId: null,
      currentDocumentFingerprint: get().currentDocumentFingerprint,
      assetRecords: get().assetRecords,
      lastPersistedAt: get().lastPersistedAt,
    });
  },

  hydrateWriterSession: ({
    documentFingerprint,
    elements,
    assetRecords = [],
    persistedAt = null,
  }) => {
    set({
      ...createInitialWriterV2State({
        elements,
      }),
      dirty: false,
      editingId: null,
      currentDocumentFingerprint: documentFingerprint,
      assetRecords: assetRecords.map((asset) => ({ ...asset })),
      lastPersistedAt: persistedAt,
    });
  },

  markWriterPersisted: (persistedAt = new Date().toISOString()) => {
    set({
      dirty: false,
      lastPersistedAt: persistedAt,
    });
  },

  clearWriterV2: () => {
    set({
      ...createInitialWriterV2State(),
      activeWriterTool: 'select',
      editingId: null,
      currentDocumentFingerprint: null,
      assetRecords: [],
      lastPersistedAt: null,
    });
  },
}));

/**
 * Merges the 6 core WriterV2State fields from a command result into the store,
 * preserving UI-only fields (editingId, currentDocumentFingerprint, assetRecords,
 * lastPersistedAt) from the current store state unless overridden.
 */
function applyCommandStateToStore(
  commandState: WriterV2State,
  current: WriterV2StoreState,
  overrides: Partial<Pick<WriterV2StoreState, 'editingId'>> = {},
): Partial<WriterV2StoreState> {
  return {
    elements: commandState.elements,
    selectedIds: commandState.selectedIds,
    activeId: commandState.activeId,
    undoStack: commandState.undoStack,
    redoStack: commandState.redoStack,
    dirty: commandState.dirty,
    editingId: 'editingId' in overrides ? overrides.editingId ?? null : current.editingId,
    currentDocumentFingerprint: current.currentDocumentFingerprint,
    assetRecords: current.assetRecords,
    lastPersistedAt: current.lastPersistedAt,
  };
}

export function selectVisibleWriterElementsForPage(
  state: WriterV2State,
  pageIndex: number,
): WriterElementV2[] {
  return getVisibleWriterElements(state, pageIndex);
}
