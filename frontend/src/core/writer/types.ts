export type WriterTool =
  | 'select'
  | 'place-text'
  | 'place-image'
  | 'place-table'
  | 'ocr-region'
  | 'pan'
  | 'rich-text'
  | 'table'
  | 'image'
  | 'template'
  | 'header-footer'
  | 'inspect'
  | 'object-list';

export type TransformHandle = 'nw' | 'ne' | 'se' | 'sw' | 'move';

export interface WriterStyles {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  padding?: number;
  opacity?: number;
  borderWidth?: number;
  borderColor?: string;
  lineHeight?: number;
  fontWeight?: 'normal' | 'bold' | string;
  fontStyle?: 'normal' | 'italic' | string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

/**
 * Compatibility name used by newer enhancement code.
 *
 * Canonical repo name remains WriterStyles for existing app compatibility.
 */
export type WriterElementStyle = WriterStyles;

export interface WriterCellStyle {
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  align?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'bold';
  bold?: boolean;
  fontStyle?: 'normal' | 'italic';
  color?: string;
}

export interface WriterTableCell {
  id: string;
  text: string;
  colspan?: number;
  rowspan?: number;
  style?: WriterCellStyle;
}

export interface WriterTableRow {
  id: string;
  cells: WriterTableCell[];
}

export interface WriterTableColumn {
  id: string;
  label?: string;
  width?: number;
}

export interface WriterTableStyle {
  borderColor?: string;
  headerBg?: string;
  headerBackgroundColor?: string;
  fontSize?: number;
  borderWidth?: number;
  cellPadding?: number;
}

/**
 * Canonical repo table shape.
 */
export interface WriterTableData {
  rows: WriterTableRow[];
  columns: WriterTableColumn[];
  style: WriterTableStyle;
}

/**
 * Compatibility name used by newer enhancement code.
 */
export type WriterTableModel = WriterTableData;

export interface WriterRichTextRun {
  id?: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  style?: WriterStyles;
}

export interface WriterRichTextBlock {
  id?: string;
  type?: 'paragraph' | 'heading' | 'list-item';
  runs?: WriterRichTextRun[];
  text?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface WriterRichTextModel {
  kind: 'rich-text';
  blocks: WriterRichTextBlock[];
}

export interface WriterImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WriterImageModel {
  kind: 'image';
  src: string;
  alt?: string;
  opacity?: number;
  rotation?: number;
  crop?: WriterImageCrop;
}

export type WriterContentModel =
  | WriterRichTextModel
  | (WriterTableModel & { kind?: 'table' })
  | WriterImageModel;

export interface WriterSourceMeta {
  source?: 'manual' | 'paste' | 'template' | 'import' | string;
  importedAt?: string;
  mimeType?: string;
  fileName?: string;
}

export interface PlacedElement {
  id: string;
  type: 'rich-text' | 'image' | 'table';
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;

  /**
   * Existing app contract:
   * - HTML for rich text
   * - base64/data URL for image
   * - JSON string for table
   */
  content: string;

  /**
   * Existing app contract.
   */
  styles: WriterStyles;

  /**
   * Compatibility property used by some enhanced writer code.
   * Keep optional. Do not migrate existing app code blindly from styles -> style.
   */
  style?: WriterElementStyle;

  /**
   * Compatibility model field used by enhanced code.
   * Existing app can keep using content.
   */
  contentModel?: WriterContentModel;

  zIndex: number;
  locked: boolean;

  /**
   * Compatibility fields used by inspector/object-list/export layers.
   */
  hidden?: boolean;
  name?: string;
  sourceMeta?: WriterSourceMeta;
}

export interface WriterSelectionState {
  selectedElementId: string | null;
  selectedTool: WriterTool;
}

export interface WriterStoreSnapshot {
  tool: WriterTool;
  elements: PlacedElement[];
  selectedElementId: string | null;
}