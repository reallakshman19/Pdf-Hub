import type { AnnotationType } from '@/core/annotations/annotationTypes';
import type { PageId } from '@/core/pages/types';
import type { CadGridMode, IsoplaneMode } from '@/core/cad-grid/types';

export type ActiveMode = 'file' | 'view' | 'annotate' | 'draw' | 'write' | 'organize' | 'generate';

export type ActiveTool = 'select' | 'hand' | AnnotationType;

export type SidebarTab =
  | 'thumbnails'
  | 'bookmarks'
  | 'comments'
  | 'search'
  | 'macros'
  | 'ocr'
  | 'redaction';

export type InspectorTab = 'properties' | 'text' | 'style' | 'history' | 'review' | 'takeoff' | 'redaction' | 'compliance';
export type RibbonTab = 'file' | 'organize' | 'annotate' | 'macro' | 'view';
export type WorkspaceViewMode = '2d' | '3d';

export interface ExistingPdfTextSelection {
  revisionId: string;
  pageId: PageId;
  sourceIndex: number;
}

export interface EditorState {
  activeTool: ActiveTool;
  activeMode: ActiveMode;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  workspaceViewMode: WorkspaceViewMode;
  leftPanelWidth: number;
  rightPanelWidth: number;
  macroBuilderOpen: boolean;
  macroBuilderSource: string | null;
  mobileDrawerOpen: boolean;
  mobileSheetOpen: boolean;
  existingTextSelection: ExistingPdfTextSelection | null;
  cadGridMode: CadGridMode;
  cadIsoplane: IsoplaneMode;
  cadGridSnap: boolean;
  cadGridSpacing: number;
  cadToolsOpen: boolean;
}
