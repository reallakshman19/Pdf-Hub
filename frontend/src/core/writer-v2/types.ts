export type WriterElementKind =
  | 'richTextBox'
  | 'textCallout'
  | 'reviewLabel'
  | 'textStamp'
  | 'richNote'
  | 'tableBox'
  | 'imageBox';

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

export interface WriterAssetRef {
  id: string;
  kind: 'image';
  mimeType: string;
  dataUrl?: string;
  width?: number;
  height?: number;
}

export interface WriterTableCell {
  id: string;
  text: string;
  colSpan?: number;
  rowSpan?: number;
}

export interface WriterTableRow {
  id: string;
  cells: WriterTableCell[];
}

export interface WriterTableData {
  columns: Array<{
    id: string;
    label?: string;
    width?: number;
  }>;
  rows: WriterTableRow[];
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
  };

  createdAt: string;
  updatedAt: string;

  locked: boolean;
  hidden: boolean;
}
