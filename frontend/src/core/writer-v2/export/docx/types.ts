import type { WriterElementKind } from '../../types';

export type PortableTextAlignment = 'left' | 'center' | 'right' | 'justify';
export type PortableHeadingTag = 'h1' | 'h2' | 'h3';
export type PortableListType = 'bullet' | 'number' | 'check';

export interface PortableTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
}

export interface PortableInlineText {
  text: string;
  style: PortableTextStyle;
  /** HTTP/HTTPS URL when this run should become a hyperlink. */
  href?: string;
}

export interface PortableBlockSource {
  elementId?: string;
  elementType?: WriterElementKind;
  pageIndex?: number;
}

export interface PortableParagraphBlock extends PortableBlockSource {
  type: 'paragraph';
  alignment?: PortableTextAlignment;
  indent?: number;
  children: PortableInlineText[];
}

export interface PortableHeadingBlock extends PortableBlockSource {
  type: 'heading';
  tag: PortableHeadingTag;
  alignment?: PortableTextAlignment;
  children: PortableInlineText[];
}

export interface PortableListBlock extends PortableBlockSource {
  type: 'list';
  listType: PortableListType;
  items: Array<{
    indent?: number;
    checked?: boolean;
    children: PortableInlineText[];
  }>;
}

export type PortableTableHorizontalAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'justify';

export type PortableTableVerticalAlignment =
  | 'top'
  | 'middle'
  | 'bottom';

export type PortableTableBorderStyle =
  | 'none'
  | 'single'
  | 'dashed'
  | 'dotted'
  | 'double';

export interface PortableTableBorder {
  style?: PortableTableBorderStyle;
  color?: string;
  width?: number;
}

export interface PortableTableCellStyle {
  alignment?: PortableTableHorizontalAlignment;
  verticalAlign?: PortableTableVerticalAlignment;

  fontFamily?: string;
  fontSize?: number;
  textColor?: string;

  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;

  backgroundColor?: string;
  padding?: number;

  borders?: {
    top?: PortableTableBorder;
    right?: PortableTableBorder;
    bottom?: PortableTableBorder;
    left?: PortableTableBorder;
  };
}

export interface PortableTableBlock extends PortableBlockSource {
  type: 'table';
  rows: Array<{
    cells: Array<{
      children: PortableExportBlock[];
      colSpan?: number;
      rowSpan?: number;

      /**
       * Width hint in Writer/PDF points.
       */
      width?: number;

      style?: PortableTableCellStyle;
    }>;
  }>;
}

export interface PortableImageBlock extends PortableBlockSource {
  type: 'image';

  /**
   * Existing WriterAssetRecordV2 id for imageBox / attached assets.
   * Prefer this for Writer V2 image boxes.
   */
  assetId?: string;

  /**
   * Existing rich text inline image source, commonly a data URL.
   * Kept for compatibility with richTextRenderer inline-image blocks.
   */
  src?: string;

  altText?: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
  caption?: string;
}

export interface PortablePageBreakBlock extends PortableBlockSource {
  type: 'pageBreak';
  fromPageIndex: number;
  toPageIndex: number;
}

export type PortableExportBlock =
  | PortableParagraphBlock
  | PortableHeadingBlock
  | PortableListBlock
  | PortableTableBlock
  | PortableImageBlock
  | PortablePageBreakBlock;

export type WriterDocxDiagnosticLevel = 'info' | 'warning' | 'error';

export type WriterDocxDiagnosticCode =
  | 'EMPTY_DOCUMENT'
  | 'HIDDEN_ELEMENT_SKIPPED'
  | 'INVALID_EDITOR_STATE'
  | 'PLAIN_TEXT_FALLBACK_USED'
  | 'UNKNOWN_ELEMENT_TYPE'
  | 'INVALID_TABLE_DATA'
  | 'MISSING_IMAGE_ASSET'
  | 'INLINE_IMAGE_SRC_USED'
  | 'UNSUPPORTED_DOCX_FEATURE';

export interface WriterDocxExportDiagnostic {
  level: WriterDocxDiagnosticLevel;
  code: WriterDocxDiagnosticCode;
  message: string;
  elementId?: string;
  elementType?: WriterElementKind;
  pageIndex?: number;
}

export interface WriterDocxPortableBlockResult {
  blocks: PortableExportBlock[];
  diagnostics: WriterDocxExportDiagnostic[];
  exportedElementCount: number;
  skippedHiddenElementCount: number;
  fatal: boolean;
}
