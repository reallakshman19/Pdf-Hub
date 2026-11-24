import { create } from 'zustand';
import type {
  ActiveTool,
  ActiveMode,
  EditorState,
  ExistingPdfTextSelection,
  InspectorTab,
  SidebarTab,
  WorkspaceViewMode,
} from './types';
import type { CadGridMode, IsoplaneMode } from '@/core/cad-grid/types';
import { normalizeActiveTool } from '@/core/tool-policy/disabledTools';

export interface EditorActions {
  setActiveTool: (tool: ActiveTool) => void;
  setActiveMode: (mode: ActiveMode) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setWorkspaceViewMode: (mode: WorkspaceViewMode) => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setMacroBuilderOpen: (open: boolean) => void;
  setMacroBuilderSource: (source: string | null) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setExistingTextSelection: (selection: ExistingPdfTextSelection | null) => void;
  setCadGridMode: (mode: CadGridMode) => void;
  setCadIsoplane: (isoplane: IsoplaneMode) => void;
  toggleCadGridSnap: () => void;
  setCadGridSnap: (snap: boolean) => void;
  setCadGridSpacing: (spacing: number) => void;
  cycleCadIsoplane: () => void;
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  activeTool: 'select',
  activeMode: 'annotate',
  sidebarTab: 'thumbnails',
  inspectorTab: 'properties',
  workspaceViewMode: '2d',
  leftPanelWidth: 20,
  rightPanelWidth: 18,
  macroBuilderOpen: false,
  macroBuilderSource: null,
  mobileDrawerOpen: false,
  mobileSheetOpen: false,
  existingTextSelection: null,
  cadGridMode: 'none',
  cadIsoplane: 'all',
  cadGridSnap: false,
  cadGridSpacing: 20,
  setActiveTool: (activeTool) => set({
    activeTool: normalizeActiveTool(activeTool),
  }),
  setActiveMode: (activeMode) => set({ activeMode }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setWorkspaceViewMode: (workspaceViewMode) => set({ workspaceViewMode }),
  setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
  setMacroBuilderOpen: (macroBuilderOpen) => set({ macroBuilderOpen }),
  setMacroBuilderSource: (macroBuilderSource) => set({ macroBuilderSource }),
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
  setExistingTextSelection: (existingTextSelection) => set({ existingTextSelection }),
  setCadGridMode: (cadGridMode) => set({ cadGridMode }),
  setCadIsoplane: (cadIsoplane) => set({ cadIsoplane }),
  toggleCadGridSnap: () => set((state) => ({ cadGridSnap: !state.cadGridSnap })),
  setCadGridSnap: (cadGridSnap) => set({ cadGridSnap }),
  setCadGridSpacing: (cadGridSpacing) => set({ cadGridSpacing: Math.max(5, cadGridSpacing) }),
  cycleCadIsoplane: () => set((state) => {
    const cycle: IsoplaneMode[] = ['all', 'top', 'right', 'left'];
    const nextIdx = (cycle.indexOf(state.cadIsoplane) + 1) % cycle.length;
    return { cadIsoplane: cycle[nextIdx] };
  }),
}));
