import type { AnnotationType } from '@/core/annotations/annotationTypes';
import type { PageId } from '@/core/pages/types';

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

export type InspectorTab = 'properties' | 'text' | 'style' | 'history' | 'review';
export type RibbonTab = 'file' | 'organize' | 'annotate' | 'macro' | 'view';

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
  leftPanelWidth: number;
  rightPanelWidth: number;
  macroBuilderOpen: boolean;
  macroBuilderSource: string | null;
  mobileDrawerOpen: boolean;
  mobileSheetOpen: boolean;
  existingTextSelection: ExistingPdfTextSelection | null;
}
