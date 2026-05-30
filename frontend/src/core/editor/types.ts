import type { AnnotationType } from '@/core/annotations/annotationTypes';

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

export type InspectorTab = 'properties' | 'style' | 'history' | 'review';
export type RibbonTab = 'file' | 'organize' | 'annotate' | 'macro' | 'view';

export interface EditorState {
  activeTool: ActiveTool;
  activeMode: ActiveMode;
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  leftPanelWidth: number;
  rightPanelWidth: number;
  macroBuilderOpen: boolean;
}
