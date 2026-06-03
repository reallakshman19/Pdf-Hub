import { create } from 'zustand';
import type { LexicalEditor } from 'lexical';

export interface ActiveEditorState {
  activeEditor: LexicalEditor | null;
}

export interface ActiveEditorActions {
  setActiveEditor: (editor: LexicalEditor | null) => void;
}

export type ActiveEditorStore = ActiveEditorState & ActiveEditorActions;

export const useActiveEditorStore = create<ActiveEditorStore>((set) => ({
  activeEditor: null,
  setActiveEditor: (editor) => set({ activeEditor: editor }),
}));
