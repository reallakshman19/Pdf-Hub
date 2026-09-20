import { create } from 'zustand';
import { useAnnotationStore } from '../annotations/store';
import { materializePdfCommand } from '../commands/types';
import {
  recordStateTransaction,
  writerHistoryState,
} from '../document-history/stateTransaction';
import {
  commitDurableStateMutation,
} from '../document-history/durableStateTransaction';
import { useSessionStore } from '../session/store';
import {
  createInitialWriterV2State,
  executeWriterCommand,
  getVisibleWriterElements,
  redoWriterCommand,
  undoWriterCommand,
  type WriterV2CommandResult,
  type WriterV2State,
} from './writerCommandStore';
import { isMutationCommand, type WriterCommand } from './writerCommands';
import type {
  WriterDocumentMetaV2,
  WriterElementV2,
  WriterPageSetupV2,
} from './types';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import {
  persistWriterAssetReferences,
} from './persistence/writerAssetDurability';
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
import { updateWriterDocumentTitle } from './writerDocumentTitle';
import {
  normalizeWriterPageAnchors,
  writerElementForTargetPage,
} from './writerPageAnchor';
import type { PageGraph, PageNode } from '../pages/types';

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
  dispatchWriterCommandDurable: (
    command: WriterCommand,
  ) => Promise<WriterV2CommandResult>;
  dispatchWriterCommandDurableLatest: (
    factory: (
      state: WriterV2StoreState,
    ) => WriterCommand | null,
  ) => Promise<WriterV2CommandResult>;
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
  renameBlankWriterDocument: (title: string, now?: string) => void;
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
    const beforeStore = get();
    const previousEditingId = beforeStore.editingId;
    const session = useSessionStore.getState();
    const result = executeWriterCommandForSession(
      beforeStore,
      command,
      session,
    );
    const useGlobalHistory =
      result.changed
      && isMutationCommand(command)
      && beforeStore.documentMeta?.mode === 'pdfOverlay'
      && Boolean(session.documentKey && session.workingBytes);

    const nextStore = applyCommandStateToStore(result.state, beforeStore, {
      editingId: command.type === 'DELETE_WRITER_ELEMENT'
        && previousEditingId === command.id
          ? null
          : previousEditingId,
    });

    if (useGlobalHistory) {
      nextStore.undoStack = [];
      nextStore.redoStack = [];
    }

    set(nextStore);

    if (useGlobalHistory && session.documentKey) {
      const afterStore = get();
      const annotations = useAnnotationStore.getState().annotations;
      const label = writerCommandLabel(command);

      recordStateTransaction({
        command: materializePdfCommand(
          {
            type: 'WRITER_CHANGE',
            payload: {
              action: label,
              elementIds: writerCommandElementIds(command),
            },
          },
          'writer-store',
          session.documentKey,
        ),
        label,
        before: {
          annotations,
          writer: writerHistoryState(beforeStore),
        },
        after: {
          annotations,
          writer: writerHistoryState(afterStore),
        },
      });

      session.setDirty(true);

      return {
        ...result,
        state: writerCommandState(afterStore),
      };
    }

    return result;
  },

  dispatchWriterCommandDurable: async (command) => {
    const initialStore = get();
    const initialSession = useSessionStore.getState();

    if (
      !isMutationCommand(command)
      || !usesDurableWriterHistory(
        initialStore,
        initialSession,
      )
    ) {
      return get().dispatchWriterCommand(command);
    }

    return get().dispatchWriterCommandDurableLatest(
      () => command,
    );
  },

  dispatchWriterCommandDurableLatest: async (
    factory,
  ) => {
    const initialStore = get();
    const initialSession =
      useSessionStore.getState();

    if (
      !usesDurableWriterHistory(
        initialStore,
        initialSession,
      )
    ) {
      const command = factory(initialStore);

      if (!command) {
        return {
          state: writerCommandState(initialStore),
          changed: false,
          reason:
            'Writer command factory produced no command.',
        };
      }

      return get().dispatchWriterCommand(command);
    }

    let committedResult:
      | WriterV2CommandResult
      | null = null;

    await commitDurableStateMutation(async () => {
      const beforeStore = get();
      const session = useSessionStore.getState();

      if (
        !usesDurableWriterHistory(
          beforeStore,
          session,
        )
      ) {
        const fallbackCommand =
          factory(beforeStore);

        committedResult = fallbackCommand
          ? get().dispatchWriterCommand(
              fallbackCommand,
            )
          : {
              state:
                writerCommandState(beforeStore),
              changed: false,
              reason:
                'Writer command factory produced no command.',
            };
        return null;
      }

      const command = factory(beforeStore);

      if (!command) {
        committedResult = {
          state: writerCommandState(beforeStore),
          changed: false,
          reason:
            'Writer command factory produced no command.',
        };
        return null;
      }

      if (!isMutationCommand(command)) {
        committedResult =
          get().dispatchWriterCommand(command);
        return null;
      }

      const previousEditingId =
        beforeStore.editingId;
      const result =
        executeWriterCommandForSession(
          beforeStore,
          command,
          session,
        );

      if (!result.changed) {
        committedResult = result;
        return null;
      }

      const nextStore =
        applyCommandStateToStore(
          result.state,
          beforeStore,
          {
            editingId:
              command.type
                === 'DELETE_WRITER_ELEMENT'
              && previousEditingId === command.id
                ? null
                : previousEditingId,
          },
        );
      nextStore.undoStack = [];
      nextStore.redoStack = [];

      const afterStore = {
        ...beforeStore,
        ...nextStore,
      } as WriterV2StoreState;
      const annotations =
        useAnnotationStore.getState().annotations;
      const label = writerCommandLabel(command);
      const newlyReferencedAssetIds =
        collectNewWriterAssetReferences(
          beforeStore.elements,
          afterStore.elements,
        );

      await persistWriterAssetReferences(
        session.documentKey as string,
        newlyReferencedAssetIds,
        afterStore.assetRecords,
      );

      committedResult = {
        ...result,
        state: writerCommandState(afterStore),
      };

      return {
        command: materializePdfCommand(
          {
            type: 'WRITER_CHANGE',
            payload: {
              action: label,
              elementIds:
                writerCommandElementIds(command),
            },
          },
          'writer-store',
          session.documentKey as string,
        ),
        label,
        before: {
          annotations,
          writer:
            writerHistoryState(beforeStore),
        },
        after: {
          annotations,
          writer:
            writerHistoryState(afterStore),
        },
        apply: () => {
          set(nextStore);
          useSessionStore
            .getState()
            .setDirty(true);
        },
        rollback: () => {
          set(writerStoreSnapshot(beforeStore));
        },
      };
    });

    return committedResult ?? {
      state: writerCommandState(get()),
      changed: false,
      reason:
        'Writer command did not produce a durable change.',
    };
  },

  undoWriter: () => {
    if (usesGlobalWriterHistory(get())) {
      return {
        state: writerCommandState(get()),
        changed: false,
        reason: 'PDF-backed Writer undo is owned by document history.',
      };
    }

    const result = undoWriterCommand(get());
    set(applyCommandStateToStore(result.state, get(), { editingId: null }));
    return result;
  },

  redoWriter: () => {
    if (usesGlobalWriterHistory(get())) {
      return {
        state: writerCommandState(get()),
        changed: false,
        reason: 'PDF-backed Writer redo is owned by document history.',
      };
    }

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

  renameBlankWriterDocument: (title, now) => {
    const current = get().documentMeta;

    if (!current || current.mode !== 'blankDocument') {
      return;
    }

    set({
      documentMeta: updateWriterDocumentTitle(current, title, now),
      dirty: true,
    });
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
    const current = get();
    const hydratedElements =
      current.documentMeta?.mode === 'pdfOverlay'
        ? normalizeWriterPageAnchors(
            elements,
            useSessionStore.getState().pageGraph,
          )
        : elements;

    set({
      ...createInitialWriterV2State({
        elements: hydratedElements,
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
    const resolvedMeta = documentMeta ?? fallbackMeta;
    const hydratedElements =
      resolvedMeta.mode === 'pdfOverlay'
        ? normalizeWriterPageAnchors(
            elements,
            useSessionStore.getState().pageGraph,
          )
        : elements;

    set({
      ...createInitialWriterV2State({
        elements: hydratedElements,
      }),
      dirty: false,
      editingId: null,
      currentDocumentFingerprint: documentFingerprint,
      documentMeta: resolvedMeta,
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


function normalizeWriterCommandElements(
  elements: WriterElementV2[],
  command: WriterCommand,
  graph: PageGraph<PageNode> | null,
): WriterElementV2[] {
  if (!graph) return elements;

  let retargeted = elements;

  if (
    command.type === 'ADD_WRITER_ELEMENT'
    && Number.isInteger(command.element.pageIndex)
  ) {
    retargeted = elements.map((element) =>
      element.id === command.element.id
        ? writerElementForTargetPage(element, graph, command.element.pageIndex)
        : element,
    );
  }

  if (command.type === 'BATCH_ADD_WRITER_ELEMENTS') {
    const targetById = new Map(
      command.elements.map((element) => [element.id, element.pageIndex] as const),
    );
    retargeted = elements.map((element) => {
      const pageIndex = targetById.get(element.id);
      return pageIndex === undefined
        ? element
        : writerElementForTargetPage(element, graph, pageIndex);
    });
  }

  if (command.type === 'BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS') {
    const targetById = new Map<string, number>();

    for (const element of command.elements) {
      targetById.set(
        element.id,
        element.pageIndex,
      );
    }

    for (const update of command.updates) {
      if (
        typeof update.patch.pageIndex
        === 'number'
      ) {
        targetById.set(
          update.id,
          update.patch.pageIndex,
        );
      }
    }

    retargeted = retargeted.map((element) => {
      const pageIndex =
        targetById.get(element.id);

      return pageIndex === undefined
        ? element
        : writerElementForTargetPage(
            element,
            graph,
            pageIndex,
          );
    });
  }

  if (
    command.type === 'UPDATE_WRITER_ELEMENT'
    && typeof command.patch.pageIndex === 'number'
  ) {
    retargeted = retargeted.map((element) =>
      element.id === command.id
        ? writerElementForTargetPage(element, graph, command.patch.pageIndex as number)
        : element,
    );
  }

  if (command.type === 'BATCH_UPDATE_WRITER_ELEMENTS') {
    const targetById = new Map(
      command.updates.flatMap((update) =>
        typeof update.patch.pageIndex === 'number'
          ? [[update.id, update.patch.pageIndex] as const]
          : [],
      ),
    );
    retargeted = retargeted.map((element) => {
      const pageIndex = targetById.get(element.id);
      return pageIndex === undefined
        ? element
        : writerElementForTargetPage(element, graph, pageIndex);
    });
  }

  return normalizeWriterPageAnchors(retargeted, graph);
}

function executeWriterCommandForSession(
  beforeStore: WriterV2StoreState,
  command: WriterCommand,
  session: ReturnType<typeof useSessionStore.getState>,
): WriterV2CommandResult {
  const rawResult =
    executeWriterCommand(beforeStore, command);
  const isPdfOverlaySession =
    beforeStore.documentMeta?.mode === 'pdfOverlay'
    || (
      !beforeStore.documentMeta
      && Boolean(
        session.pageGraph
        && session.workingBytes,
      )
    );

  if (!rawResult.changed || !isPdfOverlaySession) {
    return rawResult;
  }

  return {
    ...rawResult,
    state: {
      ...rawResult.state,
      elements: normalizeWriterCommandElements(
        rawResult.state.elements,
        command,
        session.pageGraph,
      ),
    },
  };
}

function usesDurableWriterHistory(
  state: WriterV2StoreState,
  session: ReturnType<typeof useSessionStore.getState>,
): boolean {
  return state.documentMeta?.mode === 'pdfOverlay'
    && Boolean(
      session.documentKey
      && session.revisionStoreId
      && session.activeRevisionId
      && session.historyJournalStoreId
      && session.historyJournalId,
    );
}

function collectNewWriterAssetReferences(
  beforeElements: WriterElementV2[],
  afterElements: WriterElementV2[],
): string[] {
  const beforeIds =
    collectWriterAssetReferences(beforeElements);
  const afterIds =
    collectWriterAssetReferences(afterElements);

  return [...afterIds].filter(
    (assetId) => !beforeIds.has(assetId),
  );
}

function collectWriterAssetReferences(
  elements: WriterElementV2[],
): Set<string> {
  const ids = new Set<string>();

  for (const element of elements) {
    if (element.imageAssetId) {
      ids.add(element.imageAssetId);
    }
    for (const assetId of element.assetIds ?? []) {
      if (assetId) ids.add(assetId);
    }
  }

  return ids;
}

function writerStoreSnapshot(
  state: WriterV2StoreState,
): Partial<WriterV2StoreState> {
  return {
    elements: state.elements,
    selectedIds: state.selectedIds,
    activeId: state.activeId,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    dirty: state.dirty,
    activeWriterTool: state.activeWriterTool,
    editingId: state.editingId,
    currentDocumentFingerprint:
      state.currentDocumentFingerprint,
    documentMeta: state.documentMeta,
    assetRecords: state.assetRecords,
    lastPersistedAt: state.lastPersistedAt,
    tableSelection: state.tableSelection,
  };
}

function usesGlobalWriterHistory(state: WriterV2StoreState): boolean {
  const session = useSessionStore.getState();
  const hasDurableRevision = Boolean(
    session.revisionStoreId
    && session.activeRevisionId,
  );

  return state.documentMeta?.mode === 'pdfOverlay'
    && Boolean(
      session.documentKey
      && (hasDurableRevision || session.workingBytes),
    );
}

function writerCommandState(state: WriterV2StoreState): WriterV2State {
  return {
    elements: state.elements,
    selectedIds: state.selectedIds,
    activeId: state.activeId,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    dirty: state.dirty,
  };
}

function writerCommandElementIds(command: WriterCommand): string[] {
  if (
    command.type
    === 'BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS'
  ) {
    return [
      ...command.updates.map(
        (update) => update.id,
      ),
      ...command.elements.map(
        (element) => element.id,
      ),
    ];
  }

  if ('id' in command && typeof command.id === 'string') return [command.id];
  if ('element' in command) return [command.element.id];
  if ('elements' in command) return command.elements.map((element) => element.id);
  if ('updates' in command) return command.updates.map((update) => update.id);
  if ('ids' in command) return [...command.ids];
  return [];
}

function writerCommandLabel(command: WriterCommand): string {
  const labels: Record<WriterCommand['type'], string> = {
    ADD_WRITER_ELEMENT: 'Add Writer element',
    UPDATE_WRITER_ELEMENT: 'Edit Writer element',
    DELETE_WRITER_ELEMENT: 'Delete Writer element',
    MOVE_WRITER_ELEMENT: 'Move Writer element',
    RESIZE_WRITER_ELEMENT: 'Resize Writer element',
    LOCK_WRITER_ELEMENT: 'Change Writer lock',
    HIDE_WRITER_ELEMENT: 'Change Writer visibility',
    SET_WRITER_Z_INDEX: 'Change Writer layer order',
    BRING_WRITER_FORWARD: 'Bring Writer element forward',
    SEND_WRITER_BACKWARD: 'Send Writer element backward',
    BRING_WRITER_TO_FRONT: 'Bring Writer element to front',
    SEND_WRITER_TO_BACK: 'Send Writer element to back',
    SET_ACTIVE_WRITER_ELEMENT: 'Select Writer element',
    SET_WRITER_SELECTION: 'Select Writer elements',
    CLEAR_WRITER_SELECTION: 'Clear Writer selection',
    BATCH_ADD_WRITER_ELEMENTS: 'Add Writer elements',
    BATCH_UPDATE_WRITER_ELEMENTS: 'Edit Writer elements',
    BATCH_DELETE_WRITER_ELEMENTS: 'Delete Writer elements',
    BATCH_UPDATE_AND_ADD_WRITER_ELEMENTS:
      'Consolidate Writer elements',
  };
  return labels[command.type];
}
