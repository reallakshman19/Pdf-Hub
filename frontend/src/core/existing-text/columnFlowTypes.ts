/**
 * Multi-Column Text Flow & Linked Column Reflow Types.
 * Pure TypeScript domain models (INV-4 compliant: zero external library imports).
 */

import type { ExistingTextStyleOverride } from './types';

export interface TextColumnBoundary {
  columnIndex: number;
  leftPt: number;
  topPt: number;
  widthPt: number;
  heightPt: number;
  gutterRightPt: number;
  maxLines: number;
  baselineYsPt: number[];
}

export interface MultiColumnLayout {
  pageIndex: number;
  pageId: string;
  columnCount: number;
  columns: TextColumnBoundary[];
  readingOrder: number[];
  averageLeadingPt: number;
  fontSizePt: number;
  fontName?: string;
}

export interface ColumnFlowSegment {
  columnIndex: number;
  lines: string[];
  lineBaselinesPt: Array<{ x: number; y: number }>;
  columnBoundsPt: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isTerminalColumn: boolean;
}

export interface MultiColumnReflowResult {
  totalLines: number;
  columnsUsed: number;
  overflowsEntireLayout: boolean;
  segments: ColumnFlowSegment[];
  spillOverText?: string;
}

export interface MultiColumnReflowOptions {
  fontSizePt?: number;
  leadingPt?: number;
  fontName?: string;
  charWidthRatio?: number;
  measureTextWidth?: (text: string) => number;
}

export interface MultiColumnParagraphIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageId: string;
  pageIndex: number;
  layout: MultiColumnLayout;
  replacementText: string;
  originalText: string;
  styleOverride?: ExistingTextStyleOverride;
  overflowPolicy?: 'fail-closed' | 'allow-truncation';
}

export interface MultiColumnParagraphResult {
  success: boolean;
  pageIndex: number;
  bytesModified: boolean;
  columnsUsed: number;
  totalLinesEmitted: number;
  overflowsEntireLayout: boolean;
  spillOverText?: string;
  warning?: string;
  details: {
    whiteoutRectsEmitted: number;
    segments: ColumnFlowSegment[];
  };
}
