import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from '@/core/existing-text/types';
import type {
  ExistingTextSimpleTextOperator,
} from '@/core/existing-text/provenanceTypes';
import type {
  ExistingTextSimpleReplacementMutationResult,
} from '@/core/existing-text/replacementTypes';
import type {
  ExistingTextReconstructedReplacementMutationResult,
} from '@/core/existing-text/reconstructedTypes';
import type {
  ExistingTextParagraphReplacementMutationInput,
  ExistingTextParagraphReplacementMutationResult,
} from '@/core/existing-text/paragraphTypes';

export interface PdfMutationPageMetrics {
  width: number;
  height: number;
  rotation: number;
  /** Dimensions of the visible crop after page rotation. */
  displayWidth?: number;
  displayHeight?: number;
}

export type PdfMutationPageLabelStyle =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'letters-lower'
  | 'letters-upper';

export interface PdfMutationPageLabelEntry {
  startPageIndex: number;
  style?: PdfMutationPageLabelStyle;
  prefix?: string;
  startNumber?: number;
}

export interface PdfMutationTextDrawOperation {
  pageIndex: number;
  text: string;
  xPt: number;
  yPt: number;
  fontSizePt: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  rotationDegrees?: number;
}

export interface PdfMutationVisualMaskOperation {
  pageIndex: number;
  xPt: number;
  yFromTopPt: number;
  widthPt: number;
  heightPt: number;
  fillColor: string;
}

export interface PdfMutationHeaderFooterTextStyle {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  opacity: number;
}

export interface PdfMutationHeaderFooterTextContent {
  kind: 'text';
  text: string;
  style: PdfMutationHeaderFooterTextStyle;
}

export interface PdfMutationHeaderFooterImageContent {
  kind: 'image';
  binaryResourceId: string;
  widthPt: number;
  heightPt?: number;
  opacity: number;
  fit: 'contain' | 'cover';
}

export type PdfMutationHeaderFooterContent =
  | PdfMutationHeaderFooterTextContent
  | PdfMutationHeaderFooterImageContent;

export interface PdfMutationHeaderFooterSeparator {
  thicknessPt: number;
  color: string;
  opacity: number;
  insetLeftPt: number;
  insetRightPt: number;
}

export interface PdfMutationHeaderFooterBand {
  left?: PdfMutationHeaderFooterContent;
  center?: PdfMutationHeaderFooterContent;
  right?: PdfMutationHeaderFooterContent;
  separator?: PdfMutationHeaderFooterSeparator;
}

export interface PdfMutationHeaderFooterLayout {
  leftMarginPt: number;
  rightMarginPt: number;
  headerOffsetFromTopPt: number;
  footerOffsetFromBottomPt: number;
}

export interface PdfMutationHeaderFooterPage {
  pageIndex: number;
  layout: PdfMutationHeaderFooterLayout;
  header?: PdfMutationHeaderFooterBand;
  footer?: PdfMutationHeaderFooterBand;
}

export interface PdfMutationHeaderFooterResult {
  warnings: string[];
}

export interface PdfMutationCommitResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface PdfMutationSession {
  readonly pageCount: number;

  getPageMetrics(pageIndex: number): PdfMutationPageMetrics;

  rotatePages(
    pageIndices: readonly number[],
    deltaDegrees: 90 | 180 | 270,
  ): void;

  reorderPages(order: readonly number[]): Promise<void>;

  removePages(pageIndices: readonly number[]): Promise<void>;

  insertBlankPage(
    atIndex: number,
    size: { width: number; height: number },
  ): void;

  duplicatePages(pageIndices: readonly number[]): Promise<void>;

  insertPdf(
    atIndex: number,
    donorBytes: Uint8Array,
    donorPageIndices?: readonly number[],
  ): Promise<void>;

  replacePage(
    targetIndex: number,
    donorBytes: Uint8Array,
    donorPageIndex: number,
  ): Promise<void>;

  appendPdfs(
    donorBytes: readonly Uint8Array[],
  ): Promise<void>;

  setPageLabels(
    entries: readonly PdfMutationPageLabelEntry[],
  ): void;

  drawText(
    operations: readonly PdfMutationTextDrawOperation[],
  ): Promise<void>;

  drawVisualMasks(
    operations: readonly PdfMutationVisualMaskOperation[],
  ): void;

  applyHeaderFooter(
    pages: readonly PdfMutationHeaderFooterPage[],
    binaryResources: Readonly<Record<string, Uint8Array>>,
  ): Promise<PdfMutationHeaderFooterResult>;

  replaceExistingText(
    input: {
      currentRevisionId: string;
      span: ExistingTextSpan;
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
    },
  ): Promise<ExistingTextSimpleReplacementMutationResult>;

  reconstructExistingText(
    input: {
      currentRevisionId: string;
      span: ExistingTextSpan;
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
    },
  ): Promise<ExistingTextReconstructedReplacementMutationResult>;

  replaceExistingParagraph(
    input: ExistingTextParagraphReplacementMutationInput,
  ): Promise<ExistingTextParagraphReplacementMutationResult>;

  batchReplaceExistingText(
    input: {
      currentRevisionId: string;
      items: import('@/core/commands/types').BatchReplaceExistingTextCommandItem[];
    },
  ): Promise<{ replacedCount: number; affectedPageIndices: number[] }>;

  editTableCellText(
    input: import('@/core/existing-text/tableCellTypes').ExistingTextTableCellMutationInput & {
      currentRevisionId: string;
    },
  ): Promise<import('@/core/existing-text/tableCellTypes').ExistingTextTableCellMutationResult>;

  deleteExistingText(
    input: {
      span: import('@/core/existing-text/types').ExistingTextSpan;
      intent: import('@/core/existing-text/erasureTypes').ExistingTextDeleteIntent;
      provenance?: import('@/core/existing-text/provenanceTypes').ExistingTextSimpleTextOperator;
      strategy?: import('@/core/existing-text/erasureTypes').ExistingTextDeleteStrategy;
      currentRevisionId: string;
    },
  ): Promise<import('@/core/existing-text/erasureTypes').ExistingTextDeletionResult>;

  replaceMultiColumnParagraph(
    input: {
      currentRevisionId: string;
      pageIndex: number;
      intent: import('@/core/existing-text/columnFlowTypes').MultiColumnParagraphIntent;
    },
  ): Promise<import('@/core/existing-text/columnFlowTypes').MultiColumnParagraphResult>;

  convertOcrToNativeText(
    input: {
      currentRevisionId: string;
      pageIndex: number;
      intent: import('@/core/existing-text/ocrNativeReconciliationTypes').OcrTextReconciliationIntent;
    },
  ): Promise<import('@/core/existing-text/ocrNativeReconciliationTypes').OcrTextReconciliationResult>;

  reflowCrossPageText(
    input: {
      currentRevisionId: string;
      intent: import('@/core/existing-text/crossPageFlowTypes').CrossPageFlowIntent;
    },
  ): Promise<import('@/core/existing-text/crossPageFlowTypes').CrossPageFlowResult>;

  moveExistingTextBlock(
    input: {
      currentRevisionId: string;
      pageIndex: number;
      intent: import('@/core/existing-text/frameManipulationTypes').MoveTextFrameIntent;
    },
  ): Promise<import('@/core/existing-text/frameManipulationTypes').MoveTextFrameResult>;

  resizeExistingTextBlock(
    input: {
      currentRevisionId: string;
      pageIndex: number;
      intent: import('@/core/existing-text/frameManipulationTypes').ResizeTextFrameIntent;
    },
  ): Promise<import('@/core/existing-text/frameManipulationTypes').ResizeTextFrameResult>;

  commit(): Promise<PdfMutationCommitResult>;

  dispose(): void;
}

export interface PdfMutationEngineOpenInput {
  bytes: Uint8Array;
  signal?: AbortSignal;
}

export interface PdfMutationEngine {
  open(input: PdfMutationEngineOpenInput): Promise<PdfMutationSession>;
}
