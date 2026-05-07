export type WriterTool = 'select' | 'place-text' | 'place-image' | 'place-table' | 'ocr-region';
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
}

export interface WriterCellStyle {
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'bold';
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
  width?: number; // Optional exact width, otherwise flex
}

export interface WriterTableStyle {
  borderColor?: string;
  headerBg?: string;
  fontSize?: number;
}

export interface WriterTableData {
  rows: WriterTableRow[];
  columns: WriterTableColumn[];
  style: WriterTableStyle;
}

export interface PlacedElement {
  id: string;
  type: 'rich-text' | 'image' | 'table';
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string; // JSON for table, HTML for text, base64 for image
  styles: WriterStyles;
  zIndex: number;
  locked: boolean;
}
