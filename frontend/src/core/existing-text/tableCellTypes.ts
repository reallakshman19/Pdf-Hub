import type { ExistingTextAlign } from './alignmentTypes';
import type { ExistingTextSpan, ExistingTextStyleOverride } from './types';

export interface TableCellBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DetectedTableCell {
  readonly tableId: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly bounds: TableCellBounds;
  readonly spanIds: readonly string[];
  readonly text: string;
  readonly isHeader: boolean;
  readonly suggestedAlignment: ExistingTextAlign;
}

export interface DetectedTableGrid {
  readonly tableId: string;
  readonly pageIndex: number;
  readonly bounds: TableCellBounds;
  readonly rowCount: number;
  readonly colCount: number;
  readonly cells: readonly DetectedTableCell[];
  readonly columnDividers: readonly number[]; // ascending X coordinates
  readonly rowDividers: readonly number[];    // descending Y coordinates in PDF user space
}

export interface ExistingTextTableCellMutationInput {
  readonly cell: DetectedTableCell;
  readonly span: ExistingTextSpan;
  readonly replacementText: string;
  readonly alignment?: ExistingTextAlign;
  readonly horizontalScalingPercent?: number;
  readonly styleOverride?: ExistingTextStyleOverride;
  readonly signal?: AbortSignal;
}

export interface ExistingTextTableCellMutationResult {
  readonly pageIndex: number;
  readonly tableId: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly originalText: string;
  readonly replacementText: string;
  readonly horizontalScalingPercent: number;
  readonly effectiveFontSizePt: number;
  readonly alignment: ExistingTextAlign;
}

