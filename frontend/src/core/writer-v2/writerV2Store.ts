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
  dispatchWriterCommand: (command: WriterCommand) => WriterV2CommandResult;
  undoWriter: () => WriterV2CommandResult;
  redoWriter: () => WriterV2CommandResult;
  hydrateWriterElements: (elements: WriterElementV2[]) => void;
  clearWriterV2: () => void;
}

export const useWriterV2Store = create<WriterV2StoreState>((set, get) => ({
  ...createInitialWriterV2State(),

  dispatchWriterCommand: (command) => {
    const result = executeWriterCommand(get(), command);
    set(result.state);
    return result;
  },

  undoWriter: () => {
    const result = undoWriterCommand(get());
    set(result.state);
    return result;
  },

  redoWriter: () => {
    const result = redoWriterCommand(get());
    set(result.state);
    return result;
  },

  hydrateWriterElements: (elements) => {
    set({
      ...createInitialWriterV2State({
        elements,
      }),
      dirty: false,
    });
  },

  clearWriterV2: () => {
    set(createInitialWriterV2State());
  },
}));

export function selectVisibleWriterElementsForPage(
  state: WriterV2State,
  pageIndex: number,
): WriterElementV2[] {
  return getVisibleWriterElements(state, pageIndex);
}
