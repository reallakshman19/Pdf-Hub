export type WriterElementType = 'rich-text' | 'table' | 'image' | 'text';

export interface WriterPoint {
  x: number;
  y: number;
}

export interface WriterSize {
  width: number;
  height: number;
}

export interface WriterElementStyle {
  opacity?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

export interface WriterSourceMeta {
  source:
    | 'manual'
    | 'clipboard-text'
    | 'clipboard-html'
    | 'clipboard-table'
    | 'clipboard-image'
    | 'drag-drop'
    | 'template'
    | 'legacy'
    | 'unknown';
  mimeType?: string;
  importedAt?: string;
  originalFileName?: string;
  warning?: string;
}

export type WriterContentModel =
  | WriterRichTextModel
  | WriterTableModel
  | WriterImageModel;

export interface WriterRichTextModel {
  kind: 'rich-text';
  version: 1;
  blocks: WriterRichTextBlock[];
}

export type WriterRichTextBlockType =
  | 'paragraph'
  | 'heading'
  | 'bullet'
  | 'numbered'
  | 'quote';

export interface WriterRichTextBlock {
  id: string;
  type: WriterRichTextBlockType;
  runs: WriterTextRun[];
  align?: 'left' | 'center' | 'right' | 'justify';
  level?: 1 | 2 | 3;
}

export interface WriterTextRun {
  id: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: string;
  superscript?: boolean;
  subscript?: boolean;
}

export interface WriterTableModel {
  kind: 'table';
  version: 1;
  columns: WriterTableColumn[];
  rows: WriterTableRow[];
  style?: WriterTableStyle;
}

export interface WriterTableColumn {
  id: string;
  label: string;
  width?: number;
}

export interface WriterTableRow {
  id: string;
  cells: WriterTableCell[];
}

export interface WriterTableCell {
  id: string;
  text: string;
  richText?: WriterRichTextModel;
  colspan?: number;
  rowspan?: number;
  style?: WriterTableCellStyle;
}

export interface WriterTableStyle {
  borderColor?: string;
  borderWidth?: number;
  headerBackgroundColor?: string;
  cellPadding?: number;
  fontSize?: number;
  fontFamily?: string;
}

export interface WriterTableCellStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface WriterImageModel {
  kind: 'image';
  version: 1;
  src: string;
  mimeType: string;
  naturalWidth?: number;
  naturalHeight?: number;
  alt?: string;
  crop?: WriterImageCrop;
  rotation?: number;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
}

export interface WriterImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedElement {
  id: string;
  type: WriterElementType;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  contentModel?: WriterContentModel;
  sourceMeta?: WriterSourceMeta;
  style?: WriterElementStyle;
  zIndex?: number;
  locked?: boolean;
  name?: string;
  hidden?: boolean;
}

export interface WriterElementInput {
  pageNumber: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  zIndex?: number;
}

export function isWriterContentModel(value: unknown): value is WriterContentModel {
  if (!value || typeof value !== 'object') return false;

  const kind = (value as { kind?: unknown }).kind;
  const version = (value as { version?: unknown }).version;

  return (
    version === 1 &&
    (kind === 'rich-text' || kind === 'table' || kind === 'image')
  );
}
/**
 * PDF_Hub_Enh2 Contract Bridge
 * --------------------------------
 * Add this block at the END of:
 *   frontend/src/core/writer/types.ts
 *
 * Purpose:
 * Keeps older/base writer+macro files compiling after Phase B introduced
 * WriterElementStyle / WriterTableModel canonical names.
 *
 * Do not remove the canonical Phase B names.
 * These are compatibility aliases and small missing contracts.
 */

export type WriterTool =
  | 'select'
  | 'pan'
  | 'text'
  | 'rich-text'
  | 'table'
  | 'image'
  | 'template'
  | 'header-footer'
  | 'inspect'
  | 'object-list';

/**
 * Legacy/base alias.
 * Canonical Phase B name remains WriterElementStyle.
 */
export type WriterStyles = WriterElementStyle;

/**
 * Legacy/base alias.
 * Canonical Phase B name remains WriterTableModel.
 */
export type WriterTableData = WriterTableModel;

export interface WriterSelectionState {
  selectedElementId: string | null;
  selectedTool: WriterTool;
}

export interface WriterStoreSnapshot {
  tool: WriterTool;
  elements: PlacedElement[];
  selectedElementId: string | null;
}
