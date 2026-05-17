export type ActiveMode = 'file' | 'view' | 'annotate' | 'draw' | 'write' | 'organize' | 'generate';

export type ActiveTool =
  | 'select'
  | 'hand'
  | 'textbox'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'squiggly'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'shape-cloud'
  | 'shape-polygon'
  | 'ink'
  | 'stamp'
  | 'sticky-note'
  | 'comment'
  | 'line'
  | 'arrow'
  | 'callout'
  | 'redaction';

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
