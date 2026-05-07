import { create } from 'zustand';
import type {
  ActiveTool,
  EditorState,
  InspectorTab,
  SidebarTab,
} from './types';

export interface EditorActions {
  setActiveTool: (tool: ActiveTool) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  activeTool: 'select',
  sidebarTab: 'thumbnails',
  inspectorTab: 'properties',
  leftPanelWidth: 20,
  rightPanelWidth: 18,
  setActiveTool: (activeTool) => set({ activeTool }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
}));
