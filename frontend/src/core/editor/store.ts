import { create } from 'zustand';
import type {
  ActiveTool,
  ActiveMode,
  EditorState,
  ExistingPdfTextSelection,
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
  setMacroBuilderSource: (source: string | null) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setExistingTextSelection: (selection: ExistingPdfTextSelection | null) => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  activeTool: 'select',
  activeMode: 'annotate',
  sidebarTab: 'thumbnails',
  inspectorTab: 'properties',
  leftPanelWidth: 20,
  rightPanelWidth: 18,
  macroBuilderOpen: false,
  macroBuilderSource: null,
  mobileDrawerOpen: false,
  mobileSheetOpen: false,
  existingTextSelection: null,
  setActiveTool: (activeTool) => set({
    activeTool: normalizeActiveTool(activeTool),
  }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setMacroBuilderOpen: (macroBuilderOpen) => set({ macroBuilderOpen }),
  setMacroBuilderSource: (macroBuilderSource) => set({ macroBuilderSource }),
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
  setExistingTextSelection: (existingTextSelection) => set({ existingTextSelection }),
}));
