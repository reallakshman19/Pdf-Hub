/**
 * OCR-to-Native Existing Text Bridge.
 * Maps OCR recognized lines and bounding boxes into editable ExistingTextSpan objects.
 * Pure TypeScript (INV-4 compliant).
 */

import type { ExistingTextPageContext, ExistingTextSpan } from './types';
import type { OcrLine, OcrPageResult } from '@/core/ocr/types';
import type { OcrTextReconciliationIntent } from './ocrNativeReconciliationTypes';

export function synthesizeSpansFromOcrPage(
  ocrPage: OcrPageResult,
  context: ExistingTextPageContext,
): ExistingTextSpan[] {
  const lines = ocrPage.lines ?? [];
  const spans: ExistingTextSpan[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bbox = line.bbox ?? line.rect;
    // Never invent geometry: a line without a bounding box cannot be placed.
    if (!bbox || !(bbox.width > 0) || !(bbox.height > 0)) continue;
    const fontSize = Math.max(8, Math.round(bbox.height));

    spans.push({
      id: `ocr-span-${line.id}`,
      revisionId: context.revisionId,
      pageId: context.pageId,
      pageIndex: context.pageIndex,
      sourceIndex: i,
      text: line.text,
      transform: [fontSize, 0, 0, fontSize, bbox.x, bbox.y],
      originPt: {
        x: bbox.x,
        y: bbox.y,
      },
      advanceWidthPt: bbox.width,
      sourceHeightPt: bbox.height,
      horizontalScalePt: fontSize,
      fontSizePt: fontSize,
      rotationDegrees: 0,
      skewCosine: 0,
      direction: 'ltr',
      hasEol: true,
      editability: 'reconstructed-candidate',
      reasons: ['OCR_DERIVED_TEXT'],
    });
  }

  return spans;
}

export function createOcrReconciliationIntent(
  ocrLine: OcrLine,
  editedText: string,
  context: ExistingTextPageContext,
  styleOverride?: {
    fontSizePt?: number;
    fontFamily?: string;
    colorHex?: string;
    backgroundColorHex?: string;
  },
): OcrTextReconciliationIntent {
  const bbox = ocrLine.bbox ?? ocrLine.rect ?? { x: 72, y: 700, width: 100, height: 12 };
  const fontSize = styleOverride?.fontSizePt ?? Math.max(8, Math.round(bbox.height));

  return {
    schemaVersion: 1,
    sourceRevisionId: context.revisionId,
    pageIndex: context.pageIndex,
    pageId: context.pageId,
    ocrBlockId: ocrLine.blockId ?? ocrLine.id,
    ocrLineIndices: [0],
    originalOcrText: ocrLine.text,
    editedText,
    targetBoundsPt: {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    },
    fontSizePt: fontSize,
    fontFamily: styleOverride?.fontFamily ?? 'Helvetica',
    colorHex: styleOverride?.colorHex ?? '#000000',
    backgroundColorHex: styleOverride?.backgroundColorHex ?? '#ffffff',
  };
}
