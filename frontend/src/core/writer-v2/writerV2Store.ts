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

export interface WriterV2StoreState extends WriterV2State {
  editingId: string | null;

  dispatchWriterCommand: (command: WriterCommand) => WriterV2CommandResult;
  undoWriter: () => WriterV2CommandResult;
  redoWriter: () => WriterV2CommandResult;

  beginEditingWriterElement: (id: string) => void;
  endEditingWriterElement: () => void;

  hydrateWriterElements: (elements: WriterElementV2[]) => void;
  clearWriterV2: () => void;
}

export const useWriterV2Store = create<WriterV2StoreState>((set, get) => ({
  ...createInitialWriterV2State(),
  editingId: null,

  dispatchWriterCommand: (command) => {
    const result = executeWriterCommand(get(), command);

    set({
      ...result.state,
      editingId: command.type === 'DELETE_WRITER_ELEMENT'
        && get().editingId === command.id
          ? null
          : get().editingId,
    });

    return result;
  },

  undoWriter: () => {
    const result = undoWriterCommand(get());
    set({
      ...result.state,
      editingId: null,
    });
    return result;
  },

  redoWriter: () => {
    const result = redoWriterCommand(get());
    set({
      ...result.state,
      editingId: null,
    });
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

  hydrateWriterElements: (elements) => {
    set({
      ...createInitialWriterV2State({
        elements,
      }),
      dirty: false,
      editingId: null,
    });
  },

  clearWriterV2: () => {
    set({
      ...createInitialWriterV2State(),
      editingId: null,
    });
  },
}));

export function selectVisibleWriterElementsForPage(
  state: WriterV2State,
  pageIndex: number,
): WriterElementV2[] {
  return getVisibleWriterElements(state, pageIndex);
}
