import { create } from 'zustand';
import type {
  ActiveTool,
  ActiveMode,
  EditorState,
  InspectorTab,
  SidebarTab,
} from './types';
import { normalizeActiveTool } from '@/core/tool-policy/disabledTools';

export interface EditorActions {
  setActiveTool: (tool: ActiveTool) => void;
  setActiveMode: (mode: ActiveMode) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setMacroBuilderOpen: (open: boolean) => void;
  bumpInteractionResetVersion: () => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  activeTool: 'select',
  activeMode: 'annotate',
  sidebarTab: 'thumbnails',
  inspectorTab: 'properties',
  leftPanelWidth: 20,
  rightPanelWidth: 18,
  macroBuilderOpen: false,
  interactionResetVersion: 0,
  setActiveTool: (activeTool) => set({
    activeTool: normalizeActiveTool(activeTool),
  }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setMacroBuilderOpen: (macroBuilderOpen) => set({ macroBuilderOpen }),
  bumpInteractionResetVersion: () => set((s) => ({ interactionResetVersion: s.interactionResetVersion + 1 })),
}));
