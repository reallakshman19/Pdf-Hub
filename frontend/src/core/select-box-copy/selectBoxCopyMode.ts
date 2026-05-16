import type { SelectBoxCopyResult } from './types';

export type SelectBoxInsertMode = 'auto' | 'text' | 'table' | 'image';

export interface SelectBoxCopySummary {
  itemCount: number;
  rowCount: number;
  plainTextLength: number;
  hasTable: boolean;
  tableConfidence: number | null;
  recommendedMode: SelectBoxInsertMode;
  confidenceLabel: 'none' | 'low' | 'medium' | 'high';
  message: string;
}

export function summarizeSelectBoxCopyResult(
  result: SelectBoxCopyResult,
): SelectBoxCopySummary {
  const tableConfidence = result.table?.confidence ?? null;
  const hasTable = tableConfidence !== null;
  const recommendedMode = resolveRecommendedMode(result);
  const confidenceLabel = confidenceLabelFor(tableConfidence);

  return {
    itemCount: result.items.length,
    rowCount: result.rows.length,
    plainTextLength: result.plainText.length,
    hasTable,
    tableConfidence,
    recommendedMode,
    confidenceLabel,
    message: messageFor(result, recommendedMode, confidenceLabel),
  };
}

export function resolveRecommendedMode(
  result: SelectBoxCopyResult,
): SelectBoxInsertMode {
  if (result.table && result.table.confidence >= 0.75) {
    return 'table';
  }

  if (result.plainText.trim()) {
    return 'text';
  }

  return 'image';
}

export function confidenceLabelFor(
  confidence: number | null | undefined,
): SelectBoxCopySummary['confidenceLabel'] {
  if (confidence === null || confidence === undefined) return 'none';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

export function canUseTableMode(result: SelectBoxCopyResult): boolean {
  return !!result.table;
}

function messageFor(
  result: SelectBoxCopyResult,
  recommendedMode: SelectBoxInsertMode,
  confidenceLabel: SelectBoxCopySummary['confidenceLabel'],
): string {
  if (result.items.length === 0 && !result.plainText.trim()) {
    return 'No selectable text was found. Use Copy Image or Insert as Image.';
  }

  if (recommendedMode === 'table') {
    return `Table detected with ${confidenceLabel} confidence. Preview before copying.`;
  }

  if (recommendedMode === 'text') {
    return 'Text detected. Use formatted copy or insert as Writer text.';
  }

  return 'Use image mode for exact visual copy.';
}