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
import type {
  WriterDocumentMetaV2,
  WriterElementV2,
  WriterPageSetupV2,
} from './types';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import { normalizeWriterToolForRichAuthoring } from './writerToolPolicy';
import type { WriterTableSelection } from './table-pro/writerTableSelection';
import {
  addWriterPage,
  createBlankWriterDocumentMeta,
  createPdfOverlayWriterDocumentMeta,
  deleteWriterPage,
  duplicateWriterPage,
  updateWriterDocumentPageSetup,
} from './writerDocumentMode';

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
  documentMeta: WriterDocumentMetaV2 | null;
  assetRecords: WriterAssetRecordV2[];
  lastPersistedAt: string | null;

  tableSelection: WriterTableSelection | null;
  setTableSelection: (selection: WriterTableSelection | null) => void;

  dispatchWriterCommand: (command: WriterCommand) => WriterV2CommandResult;
  undoWriter: () => WriterV2CommandResult;
  redoWriter: () => WriterV2CommandResult;

  beginEditingWriterElement: (id: string) => void;
  endEditingWriterElement: () => void;

  addWriterAssets: (assets: WriterAssetRecordV2[]) => void;
  removeWriterAsset: (assetId: string) => void;

  createBlankWriterDocument: (input?: {
    title?: string;
    pageSetup?: WriterPageSetupV2;
    pageCount?: number;
    documentFingerprint?: string;
    now?: string;
  }) => WriterDocumentMetaV2;
  updateBlankWriterPageSetup: (patch: Partial<WriterPageSetupV2>, now?: string) => void;
  addBlankWriterPage: (afterPageIndex?: number, now?: string) => void;
  deleteBlankWriterPage: (pageIndex: number, now?: string) => void;
  duplicateBlankWriterPage: (pageIndex: number, now?: string) => void;

  hydrateWriterElements: (elements: WriterElementV2[]) => void;
  hydrateWriterSession: (input: {
    documentFingerprint: string;
    elements: WriterElementV2[];
    assetRecords?: WriterAssetRecordV2[];
    persistedAt?: string | null;
    documentMeta?: WriterDocumentMetaV2 | null;
  }) => void;

  markWriterPersisted: (persistedAt?: string) => void;
  clearWriterV2: () => void;
}

export const useWriterV2Store = create<WriterV2StoreState>((set, get) => ({
  ...createInitialWriterV2State(),
  activeWriterTool: 'select',
  editingId: null,
  currentDocumentFingerprint: null,
  documentMeta: null,
  assetRecords: [],
  lastPersistedAt: null,
  tableSelection: null,

  setTableSelection: (tableSelection) => {
    set({ tableSelection });
  },

  setActiveWriterTool: (activeWriterTool) => {
    set({
      activeWriterTool: normalizeWriterToolForRichAuthoring(activeWriterTool, {
        allowLegacyPlacement: get().documentMeta?.mode === 'blankDocument',
      }),
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

  createBlankWriterDocument: (input = {}) => {
    const meta = createBlankWriterDocumentMeta(input);

    set({
      ...createInitialWriterV2State(),
      activeWriterTool: 'select',
      editingId: null,
      currentDocumentFingerprint: meta.documentFingerprint,
      documentMeta: meta,
      assetRecords: [],
      lastPersistedAt: null,
      tableSelection: null,
      dirty: true,
    });

    return meta;
  },

  updateBlankWriterPageSetup: (patch, now) => {
    const current = get().documentMeta;

    if (!current || current.mode !== 'blankDocument') {
      return;
    }

    set({
      documentMeta: updateWriterDocumentPageSetup(current, patch, now),
      dirty: true,
    });
  },

  addBlankWriterPage: (afterPageIndex, now) => {
    const current = get().documentMeta;

    if (!current || current.mode !== 'blankDocument') {
      return;
    }

    const result = addWriterPage(current, get().elements, {
      afterPageIndex,
      now,
    });

    set({
      documentMeta: result.meta,
      elements: result.elements,
      dirty: true,
    });
  },

  deleteBlankWriterPage: (pageIndex, now) => {
    const current = get().documentMeta;

    if (!current || current.mode !== 'blankDocument') {
      return;
    }

    const { meta, result } = deleteWriterPage(current, get().elements, {
      pageIndex,
      selectedIds: get().selectedIds,
      activeId: get().activeId,
      now,
    });

    set({
      documentMeta: meta,
      elements: result.elements,
      selectedIds: result.selectedIds,
      activeId: result.activeId,
      editingId: result.activeId === get().editingId ? get().editingId : null,
      dirty: true,
    });
  },

  duplicateBlankWriterPage: (pageIndex, now) => {
    const current = get().documentMeta;

    if (!current || current.mode !== 'blankDocument') {
      return;
    }

    const { meta, result } = duplicateWriterPage(current, get().elements, {
      pageIndex,
      now,
    });

    set({
      documentMeta: meta,
      elements: result.elements,
      selectedIds: result.duplicatedIds,
      activeId: result.duplicatedIds.at(-1) ?? get().activeId,
      editingId: null,
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
      documentMeta: get().documentMeta,
      assetRecords: get().assetRecords,
      lastPersistedAt: get().lastPersistedAt,
    });
  },

  hydrateWriterSession: ({
    documentFingerprint,
    elements,
    assetRecords = [],
    persistedAt = null,
    documentMeta = null,
  }) => {
    const fallbackMeta = createPdfOverlayWriterDocumentMeta({
      documentFingerprint,
      pageCount: inferPageCountFromElements(elements),
    });

    set({
      ...createInitialWriterV2State({
        elements,
      }),
      dirty: false,
      editingId: null,
      currentDocumentFingerprint: documentFingerprint,
      documentMeta: documentMeta ?? fallbackMeta,
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
      documentMeta: null,
      assetRecords: [],
      lastPersistedAt: null,
      tableSelection: null,
    });
  },
}));

/**
 * Merges the 6 core WriterV2State fields from a command result into the store,
 * preserving UI-only fields (editingId, currentDocumentFingerprint, documentMeta,
 * assetRecords, lastPersistedAt) from the current store state unless overridden.
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
    documentMeta: current.documentMeta,
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

function inferPageCountFromElements(elements: WriterElementV2[]): number {
  if (elements.length === 0) {
    return 1;
  }

  return Math.max(1, ...elements.map((element) => element.pageIndex + 1));
}
