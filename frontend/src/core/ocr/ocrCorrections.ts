import type { PdfRect } from '../writer-v2/types';
import type { PageId } from '../pages/types';
import type {
  OcrDocumentResult,
  OcrDiagnostic,
  OcrPageResult,
} from './types';
import {
  isRectInsidePage,
  normalizeOcrText,
} from './types';

export type OcrCorrectionTargetType =
  | 'word'
  | 'line'
  | 'block'
  | 'tableCell';

export interface OcrCorrection {
  id: string;
  documentFingerprint: string;
  pageId?: PageId;
  pageIndex: number;
  targetId: string;
  targetType: OcrCorrectionTargetType;
  originalText: string;
  correctedText: string;
  bbox: PdfRect;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOcrCorrectionInput {
  id: string;
  documentFingerprint: string;
  pageId?: PageId;
  pageIndex: number;
  targetId: string;
  targetType: OcrCorrectionTargetType;
  originalText: string;
  correctedText: string;
  bbox: PdfRect;
  now?: string;
}

export interface OcrCorrectionValidationResult {
  valid: boolean;
  diagnostics: OcrDiagnostic[];
}

export interface OcrCorrectionState {
  corrections: OcrCorrection[];
}

export type OcrCorrectionAction =
  | {
      type: 'UPSERT_OCR_CORRECTION';
      correction: OcrCorrection;
    }
  | {
      type: 'DELETE_OCR_CORRECTION';
      correctionId: string;
    }
  | {
      type: 'DELETE_OCR_CORRECTION_FOR_TARGET';
      documentFingerprint: string;
      pageIndex: number;
      targetId: string;
    }
  | {
      type: 'CLEAR_OCR_CORRECTIONS_FOR_DOCUMENT';
      documentFingerprint: string;
    };

export function createOcrCorrection(
  input: CreateOcrCorrectionInput,
): OcrCorrection {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    ...(input.pageId ? { pageId: input.pageId } : {}),
    pageIndex: input.pageIndex,
    targetId: input.targetId,
    targetType: input.targetType,
    originalText: input.originalText,
    correctedText: input.correctedText,
    bbox: input.bbox,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateOcrCorrection(
  correction: OcrCorrection,
  page?: Pick<OcrPageResult, 'width' | 'height' | 'pageIndex'>,
): OcrCorrectionValidationResult {
  const diagnostics: OcrDiagnostic[] = [];

  if (!correction.id) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: correction.pageIndex,
      message: 'OCR correction has missing id.',
    });
  }

  if (!correction.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: correction.pageIndex,
      targetId: correction.targetId,
      message: 'OCR correction has missing documentFingerprint.',
    });
  }

  if (!correction.targetId) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: correction.pageIndex,
      message: 'OCR correction has missing targetId.',
    });
  }

  if (!correction.correctedText.trim()) {
    diagnostics.push({
      level: 'warning',
      code: 'EMPTY_TEXT',
      pageIndex: correction.pageIndex,
      targetId: correction.targetId,
      message: 'OCR correction has empty corrected text.',
    });
  }

  if (page) {
    if (page.pageIndex !== correction.pageIndex) {
      diagnostics.push({
        level: 'error',
        code: 'INVALID_OCR_RESULT',
        pageIndex: correction.pageIndex,
        targetId: correction.targetId,
        message: 'OCR correction pageIndex does not match supplied page.',
      });
    }

    if (!isRectInsidePage(correction.bbox, page)) {
      diagnostics.push({
        level: 'error',
        code: 'OUT_OF_PAGE_BBOX',
        pageIndex: correction.pageIndex,
        targetId: correction.targetId,
        message: 'OCR correction bbox is outside page bounds.',
      });
    }
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}

export function createOcrCorrectionState(
  corrections: OcrCorrection[] = [],
): OcrCorrectionState {
  return {
    corrections: [...corrections],
  };
}

export function ocrCorrectionReducer(
  state: OcrCorrectionState,
  action: OcrCorrectionAction,
): OcrCorrectionState {
  if (action.type === 'UPSERT_OCR_CORRECTION') {
    return {
      corrections: upsertOcrCorrection(
        state.corrections,
        action.correction,
      ),
    };
  }

  if (action.type === 'DELETE_OCR_CORRECTION') {
    return {
      corrections: state.corrections.filter(
        (correction) => correction.id !== action.correctionId,
      ),
    };
  }

  if (action.type === 'DELETE_OCR_CORRECTION_FOR_TARGET') {
    return {
      corrections: state.corrections.filter((correction) =>
        !isSameCorrectionTarget(correction, action),
      ),
    };
  }

  if (action.type === 'CLEAR_OCR_CORRECTIONS_FOR_DOCUMENT') {
    return {
      corrections: state.corrections.filter(
        (correction) =>
          correction.documentFingerprint !== action.documentFingerprint,
      ),
    };
  }

  return state;
}

export function upsertOcrCorrection(
  corrections: OcrCorrection[],
  next: OcrCorrection,
): OcrCorrection[] {
  const existingIndex = corrections.findIndex((correction) =>
    correction.id === next.id || isSameCorrectionTarget(correction, next),
  );

  if (existingIndex === -1) {
    return [...corrections, next];
  }

  const existing = corrections[existingIndex]!;

  return corrections.map((correction, index) => {
    if (index !== existingIndex) return correction;

    return {
      ...existing,
      ...next,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: next.updatedAt,
    };
  });
}

export function getOcrCorrectionForTarget(
  corrections: OcrCorrection[],
  input: {
    documentFingerprint: string;
    pageIndex: number;
    targetId: string;
  },
): OcrCorrection | null {
  return corrections.find((correction) =>
    isSameCorrectionTarget(correction, input),
  ) ?? null;
}

export function deleteOcrCorrectionForTarget(
  corrections: OcrCorrection[],
  input: {
    documentFingerprint: string;
    pageIndex: number;
    targetId: string;
  },
): OcrCorrection[] {
  return corrections.filter((correction) =>
    !isSameCorrectionTarget(correction, input),
  );
}

export function applyOcrCorrectionText(
  originalText: string,
  correction: OcrCorrection | null | undefined,
): string {
  return correction?.correctedText ?? originalText;
}

/**
 * Returns a derived OCR result with corrected text applied.
 * Does not mutate the raw OCR result.
 */
export function applyOcrCorrectionsToDocument(
  document: OcrDocumentResult,
  corrections: OcrCorrection[],
): OcrDocumentResult {
  const correctionsByTarget = createCorrectionLookup(corrections);

  const pages = document.pages.map((page) => {
    const words = (page.words ?? []).map((word) => {
      const correction = correctionsByTarget.get(targetKey({
        documentFingerprint: document.documentFingerprint,
        pageIndex: page.pageIndex ?? 0,
        targetId: word.id,
      }));

      if (!correction) return word;

      return {
        ...word,
        text: correction.correctedText,
        normalizedText: normalizeOcrText(correction.correctedText),
      };
    });

    const lines = (page.lines ?? []).map((line) => {
      const correction = correctionsByTarget.get(targetKey({
        documentFingerprint: document.documentFingerprint,
        pageIndex: page.pageIndex ?? 0,
        targetId: line.id,
      }));

      if (!correction) return line;

      return {
        ...line,
        text: correction.correctedText,
      };
    });

    const blocks = page.blocks.map((block) => {
      const correction = correctionsByTarget.get(targetKey({
        documentFingerprint: document.documentFingerprint,
        pageIndex: page.pageIndex ?? 0,
        targetId: block.id,
      }));

      if (block.type === 'table') {
        return {
          ...block,
          text: correction?.correctedText ?? block.text,
          rows: (block.rows ?? []).map((row) => ({
            ...row,
            cells: (row.cells ?? []).map((cell) => {
              const cellCorrection = correctionsByTarget.get(targetKey({
                documentFingerprint: document.documentFingerprint,
                pageIndex: page.pageIndex ?? 0,
                targetId: cell.id,
              }));

              if (!cellCorrection) return cell;

              return {
                ...cell,
                text: cellCorrection.correctedText,
              };
            }),
          })),
        };
      }

      if (!correction) return block;

      return {
        ...block,
        text: correction.correctedText,
      };
    });

    const appliedDiagnostics: OcrDiagnostic[] = corrections
      .filter((correction) =>
        correction.documentFingerprint === document.documentFingerprint
        && correction.pageIndex === page.pageIndex,
      )
      .map((correction) => ({
        level: 'info',
        code: 'CORRECTION_APPLIED',
        pageIndex: correction.pageIndex,
        targetId: correction.targetId,
        message: 'OCR correction was applied to derived OCR result.',
      }));

    return {
      ...page,
      words,
      lines,
      blocks,
      diagnostics: [
        ...(page.diagnostics ?? []),
        ...appliedDiagnostics,
      ],
    };
  });

  return {
    ...document,
    pages,
    diagnostics: [
      ...document.diagnostics,
      ...corrections.map((correction) => ({
        level: 'info' as const,
        code: 'CORRECTION_APPLIED' as const,
        pageIndex: correction.pageIndex,
        targetId: correction.targetId,
        message: 'OCR correction was applied to document result.',
      })),
    ],
  };
}

function createCorrectionLookup(
  corrections: OcrCorrection[],
): Map<string, OcrCorrection> {
  return new Map(
    corrections.map((correction) => [
      targetKey(correction),
      correction,
    ]),
  );
}

function targetKey(input: {
  documentFingerprint: string;
  pageIndex: number;
  targetId: string;
}): string {
  return `${input.documentFingerprint}:${input.pageIndex}:${input.targetId}`;
}

function isSameCorrectionTarget(
  a: {
    documentFingerprint: string;
    pageIndex: number;
    targetId: string;
  },
  b: {
    documentFingerprint: string;
    pageIndex: number;
    targetId: string;
  },
): boolean {
  return a.documentFingerprint === b.documentFingerprint
    && a.pageIndex === b.pageIndex
    && a.targetId === b.targetId;
}
