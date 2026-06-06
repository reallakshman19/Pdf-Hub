export type WriterElementKind =
  | 'richTextBox'
  | 'textCallout'
  | 'reviewLabel'
  | 'textStamp'
  | 'richNote'
  | 'tableBox'
  | 'imageBox';

export type WriterReviewStatus =
  | 'open'
  | 'inProgress'
  | 'resolved'
  | 'rejected';

export type WriterReviewPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type WriterReviewCategory =
  | 'general'
  | 'engineering'
  | 'design'
  | 'safety'
  | 'client'
  | 'construction'
  | 'qa';

export interface WriterReviewMetadata {
  status: WriterReviewStatus;
  priority: WriterReviewPriority;
  category: WriterReviewCategory;
  author?: string;
  assignee?: string;
  dueDate?: string;
  commentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PdfPoint {
  /**
   * PDF page coordinate in points.
   * Origin: bottom-left of unrotated PDF page.
   */
  x: number;
  y: number;
}

export interface PdfRect {
  /**
   * PDF page coordinate in points.
   * Origin: bottom-left of unrotated PDF page.
   */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportPoint {
  /**
   * CSS viewport/page coordinate.
   * Origin: top-left of rendered page surface.
   */
  x: number;
  y: number;
}

export interface ViewportRect {
  /**
   * CSS viewport/page coordinate.
   * Origin: top-left of rendered page surface.
   */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WriterRotation = 0 | 90 | 180 | 270;

export interface WriterPageViewport {
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
  rotation: WriterRotation;
}

export type WriterDocumentMode = 'pdfOverlay' | 'blankDocument';

export type WriterPagePreset = 'A4' | 'Letter' | 'Legal' | 'Custom';

export interface WriterPageSetupV2 {
  preset: WriterPagePreset;
  width: number;
  height: number;
  unit: 'pt';
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  backgroundColor?: string;
}

export interface WriterDocumentMetaV2 {
  documentFingerprint: string;
  mode: WriterDocumentMode;
  title?: string;
  pageSetup: WriterPageSetupV2;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

export const WRITER_PAGE_PRESETS: Record<Exclude<WriterPagePreset, 'Custom'>, WriterPageSetupV2> = {
  A4: {
    preset: 'A4',
    width: 595.28,
    height: 841.89,
    unit: 'pt',
    marginTop: 72,
    marginRight: 72,
    marginBottom: 72,
    marginLeft: 72,
    backgroundColor: '#ffffff',
  },
  Letter: {
    preset: 'Letter',
    width: 612,
    height: 792,
    unit: 'pt',
    marginTop: 72,
    marginRight: 72,
    marginBottom: 72,
    marginLeft: 72,
    backgroundColor: '#ffffff',
  },
  Legal: {
    preset: 'Legal',
    width: 612,
    height: 1008,
    unit: 'pt',
    marginTop: 72,
    marginRight: 72,
    marginBottom: 72,
    marginLeft: 72,
    backgroundColor: '#ffffff',
  },
};

export interface WriterAssetRef {
  id: string;
  kind: 'image';
  mimeType: string;
  dataUrl?: string;
  width?: number;
  height?: number;
}

export type WriterTableHorizontalAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'justify';

export type WriterTableVerticalAlignment =
  | 'top'
  | 'middle'
  | 'bottom';

export type WriterTableBorderStyle =
  | 'none'
  | 'single'
  | 'dashed'
  | 'dotted'
  | 'double';

export interface WriterTableBorder {
  style?: WriterTableBorderStyle;
  color?: string;

  /**
   * Border width in points. Kept intentionally renderer-neutral.
   * PDF export and DOCX export may quantize differently.
   */
  width?: number;
}

export interface WriterTableCellStyle {
  alignment?: WriterTableHorizontalAlignment;
  verticalAlign?: WriterTableVerticalAlignment;

  fontFamily?: string;
  fontSize?: number;
  textColor?: string;

  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;

  backgroundColor?: string;

  /**
   * Cell padding in points.
   */
  padding?: number;

  borders?: {
    top?: WriterTableBorder;
    right?: WriterTableBorder;
    bottom?: WriterTableBorder;
    left?: WriterTableBorder;
  };
}

export interface WriterTableColumn {
  id: string;
  label?: string;

  /**
   * Column width in PDF/Writer points.
   * DOCX export converts this to table cell width hints.
   */
  width?: number;

  /**
   * Optional default style for cells in this column.
   */
  style?: WriterTableCellStyle;
}

export interface WriterTableCell {
  id: string;
  text: string;
  colSpan?: number;
  rowSpan?: number;
  style?: WriterTableCellStyle;

  /**
   * Marks this cell as visually/structurally covered by a merged master cell.
   * The master cell stores colSpan/rowSpan.
   */
  mergedInto?: {
    rowIndex: number;
    columnIndex: number;
  };
}

export interface WriterTableRow {
  id: string;
  cells: WriterTableCell[];

  /**
   * Optional row height in Writer/PDF points.
   * Used by overlay editing and can later be mapped to DOCX row height.
   */
  height?: number;
}

export interface WriterTableData {
  columns: WriterTableColumn[];
  rows: WriterTableRow[];

  /**
   * Default true for backward compatibility:
   * column labels are exported as the first header row.
   */
  hasHeaderRow?: boolean;

  /**
   * Optional table-wide default cell style.
   */
  defaultCellStyle?: WriterTableCellStyle;

  /**
   * Optional header-cell style.
   */
  headerCellStyle?: WriterTableCellStyle;
}

export interface WriterElementV2 {
  id: string;
  documentFingerprint: string;
  pageIndex: number;

  type: WriterElementKind;
  rect: PdfRect;

  /**
   * Rich editor serialized state.
   * Future W5 should use Lexical JSON here.
   */
  editorStateJson?: string;
  plainText?: string;

  tableData?: WriterTableData;
  imageAssetId?: string;
  assetIds?: string[];
  review?: WriterReviewMetadata;

  callout?: {
    anchorPoint?: PdfPoint;
    leaderStyle: 'none' | 'line' | 'arrow';
    leaderColor: string;
    leaderWidth: number;
  };

  style: {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    padding?: number;
    opacity?: number;
    zIndex: number;
    fontSize?: number;
    fontFamily?: string;
    textColor?: string;
  };

  createdAt: string;
  updatedAt: string;

  locked: boolean;
  hidden: boolean;
}
