import type {
  ExistingTextSpan,
  ExistingTextStyleOverride,
} from './types';
import type { ExistingTextFitRect } from './fitTypes';

export interface ExistingTextParagraphLine {
  span: ExistingTextSpan;
  lineIndex: number;
  text: string;
  baselinePt: {
    x: number;
    y: number;
  };
  boundsPt: ExistingTextFitRect;
  advanceWidthPt: number;
}

export interface ExistingTextParagraphBlock {
  paragraphId: string;
  pageIndex: number;
  pageId: string;
  revisionId: string;
  lines: ExistingTextParagraphLine[];
  boundsPt: ExistingTextFitRect;
  fontSizePt: number;
  leadingPt: number;
  columnWidthPt: number;
  fullText: string;
  fontName?: string;
}

export interface ExistingTextParagraphReflowOptions {
  columnWidthPt?: number;
  leadingPt?: number;
  fontSizePt?: number;
  align?: import('./alignmentTypes').ExistingTextAlign;
  horizontalScalePercent?: number;
  letterSpacingPt?: number;
  styleOverride?: ExistingTextStyleOverride;
}

export interface ExistingTextReflowLine {
  lineIndex: number;
  text: string;
  advanceWidthPt: number;
  baselinePt: {
    x: number;
    y: number;
  };
  boundsPt: ExistingTextFitRect;
  alignmentLayout?: import('./alignmentTypes').AlignedLineLayout;
}

export interface ExistingTextParagraphReflowResult {
  lines: ExistingTextReflowLine[];
  columnWidthPt: number;
  leadingPt: number;
  boundsPt: ExistingTextFitRect;
  totalHeightPt: number;
  lineCountDelta: number;
}

export interface ExistingTextParagraphEditIntent {
  schemaVersion: 1;
  paragraphId: string;
  pageIndex: number;
  originalText: string;
  replacementText: string;
  styleOverride?: ExistingTextStyleOverride;
  reflowOptions?: ExistingTextParagraphReflowOptions;
}

export interface ExistingTextParagraphReplacementMutationInput {
  currentRevisionId: string;
  paragraph: ExistingTextParagraphBlock;
  intent: ExistingTextParagraphEditIntent;
  signal?: AbortSignal;
}

export interface ExistingTextParagraphReplacementMutationResult {
  paragraphId: string;
  pageIndex: number;
  originalLineCount: number;
  reflowedLineCount: number;
  originalText: string;
  replacementText: string;
  boundsPt: ExistingTextFitRect;
  mutationStrategy: 'in-place-lines' | 'reconstructed-block';
}
