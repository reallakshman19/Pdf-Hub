import type {
  OcrJob,
  OcrPageResult,
  OcrResultsByPage,
} from './types';

export interface LegacyOcrRetirementNotice {
  retired: true;
  title: string;
  message: string;
  replacement: string;
}

export interface LegacyOcrLaunchInput {
  documentKey: string;
  pageNumbers: number[];
  language?: string;
  now?: number;
}

export interface LegacyOcrCompatDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'LEGACY_OCR_RETIRED'
    | 'LEGACY_OCR_NO_DOCUMENT'
    | 'LEGACY_OCR_NO_PAGES'
    | 'LEGACY_OCR_PAGE_NUMBERS_NORMALIZED';
  message: string;
}

export interface LegacyOcrLaunchPlan {
  allowed: false;
  job: OcrJob;
  normalizedPageNumbers: number[];
  diagnostics: LegacyOcrCompatDiagnostic[];
  notice: LegacyOcrRetirementNotice;
}

export function createLegacyOcrRetirementNotice(): LegacyOcrRetirementNotice {
  return {
    retired: true,
    title: 'Preview OCR retired',
    message:
      'The old preview OCR launcher has been retired. Use the Writer-connected OCR panel for PDF rasterization, region OCR, searchable PDF, and Writer insertion.',
    replacement: 'OcrPanelWriterConnected',
  };
}

export function createLegacyOcrLaunchPlan(
  input: LegacyOcrLaunchInput,
): LegacyOcrLaunchPlan {
  const diagnostics: LegacyOcrCompatDiagnostic[] = [
    {
      level: 'warning',
      code: 'LEGACY_OCR_RETIRED',
      message: 'Legacy preview OCR is retired and will not start a recognition job.',
    },
  ];

  if (!input.documentKey) {
    diagnostics.push({
      level: 'error',
      code: 'LEGACY_OCR_NO_DOCUMENT',
      message: 'Legacy OCR launch was blocked because no document key was supplied.',
    });
  }

  const normalizedPageNumbers = normalizeLegacyOcrPageNumbers(input.pageNumbers);

  if (normalizedPageNumbers.length === 0) {
    diagnostics.push({
      level: 'warning',
      code: 'LEGACY_OCR_NO_PAGES',
      message: 'Legacy OCR launch was blocked because no valid page numbers were supplied.',
    });
  }

  if (
    normalizedPageNumbers.length !== input.pageNumbers.length
    || normalizedPageNumbers.some((pageNumber, index) => pageNumber !== input.pageNumbers[index])
  ) {
    diagnostics.push({
      level: 'info',
      code: 'LEGACY_OCR_PAGE_NUMBERS_NORMALIZED',
      message: 'Legacy OCR page numbers were normalized before creating the retired job record.',
    });
  }

  return {
    allowed: false,
    normalizedPageNumbers,
    diagnostics,
    notice: createLegacyOcrRetirementNotice(),
    job: createLegacyOcrNoopJob({
      documentKey: input.documentKey,
      pageNumbers: normalizedPageNumbers,
      language: input.language,
      now: input.now,
    }),
  };
}

export function createLegacyOcrNoopJob(
  input: LegacyOcrLaunchInput,
): OcrJob {
  const now = input.now ?? Date.now();

  return {
    id: `legacy-ocr-retired-${now}`,
    documentKey: input.documentKey,
    pageNumbers: normalizeLegacyOcrPageNumbers(input.pageNumbers),
    status: 'cancelled',
    results: [],
    queuedAt: now,
    finishedAt: now,
    cancelled: true,
  };
}

export function normalizeLegacyOcrPageNumbers(
  pageNumbers: number[],
): number[] {
  return [...new Set(
    pageNumbers.filter((pageNumber) =>
      Number.isInteger(pageNumber) && pageNumber >= 1,
    ),
  )].sort((a, b) => a - b);
}

export function createLegacyOcrEmptyResultsByPage(): OcrResultsByPage {
  return {};
}

export function createLegacyOcrRetiredPageResult(input: {
  pageNumber: number;
  language?: string;
}): OcrPageResult {
  return {
    pageNumber: input.pageNumber,
    status: 'failed',
    language: input.language ?? 'eng',
    confidence: 0,
    blocks: [],
    warnings: [
      'Legacy preview OCR is retired. Use the Writer-connected OCR panel.',
    ],
  };
}

export function shouldDisableLegacyPreviewOcr(): boolean {
  return true;
}
