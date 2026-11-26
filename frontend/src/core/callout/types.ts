export type CalloutTool =
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

/** @deprecated Use CalloutTool */
export type WriterTool = CalloutTool;

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
export type CalloutStyles = WriterStyles;
export type WriterElementStyle = WriterStyles;
export type CalloutElementStyle = WriterStyles;

export interface CalloutCellStyle {
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  align?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'bold';
  bold?: boolean;
  fontStyle?: 'normal' | 'italic';
  color?: string;
}

export interface CalloutTableCell {
  id: string;
  text: string;
  colspan?: number;
  rowspan?: number;
  style?: CalloutCellStyle;
}

export interface CalloutTableRow {
  id: string;
  cells: CalloutTableCell[];
}

export interface CalloutTableColumn {
  id: string;
  label?: string;
  width?: number;
}

export interface CalloutTableStyle {
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
export interface CalloutTableData {
  rows: CalloutTableRow[];
  columns: CalloutTableColumn[];
  style: CalloutTableStyle;
}

/**
 * Compatibility name used by newer enhancement code.
 */
export type CalloutTableModel = CalloutTableData;
export type WriterTableModel = CalloutTableData;

export interface CalloutRichTextRun {
  id?: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  style?: CalloutStyles;
}

export interface CalloutRichTextBlock {
  id?: string;
  type?: 'paragraph' | 'heading' | 'list-item';
  runs?: CalloutRichTextRun[];
  text?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
}

export interface CalloutRichTextModel {
  kind: 'rich-text';
  blocks: CalloutRichTextBlock[];
}

export interface CalloutImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalloutImageModel {
  kind: 'image';
  src: string;
  alt?: string;
  opacity?: number;
  rotation?: number;
  crop?: CalloutImageCrop;
}

export type CalloutContentModel =
  | CalloutRichTextModel
  | (CalloutTableModel & { kind?: 'table' })
  | CalloutImageModel;

export interface CalloutSourceMeta {
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
  styles: CalloutStyles;

  /** Canonical style contract alias */

  /**
   * Compatibility property used by some enhanced writer code.
   * Keep optional. Do not migrate existing app code blindly from styles -> style.
   */
  style?: CalloutElementStyle;

  /**
   * Compatibility model field used by enhanced code.
   * Existing app can keep using content.
   */
  contentModel?: CalloutContentModel;

  zIndex: number;
  locked: boolean;

  /**
   * Compatibility fields used by inspector/object-list/export layers.
   */
  hidden?: boolean;
  name?: string;
  sourceMeta?: CalloutSourceMeta;
}

export interface CalloutSelectionState {
  selectedElementId: string | null;
  selectedTool: CalloutTool;
}

export interface CalloutStoreSnapshot {
  tool: CalloutTool;
  elements: PlacedElement[];
  selectedElementId: string | null;
}
export type CalloutElement = PlacedElement;
export type WriterTableStyle = CalloutTableStyle;
export type WriterTableRow = CalloutTableRow;
export type WriterTableCell = CalloutTableCell;
export type WriterTableColumn = CalloutTableColumn;
