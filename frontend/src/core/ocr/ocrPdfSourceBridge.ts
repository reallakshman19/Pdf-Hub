export interface OcrPdfSessionLike {
  documentKey: string | null;
  fileName?: string | null;
  originalBytes?: Uint8Array | null;
  workingBytes?: Uint8Array | null;
  pageCount: number;
  selectedPages: number[];
}

export type OcrPdfBytesSourceKind =
  | 'working'
  | 'original'
  | 'none';

export interface OcrPdfSourceBridgeOptions {
  preferWorkingCopy?: boolean;
  fallbackToOriginal?: boolean;
}

export interface OcrPdfSource {
  documentFingerprint: string | null;
  fileName: string | null;
  pdfBytes: Uint8Array | null;
  bytesSource: OcrPdfBytesSourceKind;
  pageCount: number;

  /**
   * 1-based session page numbers.
   */
  selectedPageNumbers: number[];

  /**
   * 0-based OCR/PDF.js page indexes.
   */
  selectedPageIndexes: number[];

  hasPdfBytes: boolean;
  diagnostics: OcrPdfSourceDiagnostic[];
}

export interface OcrPdfSourceDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_PDF_SOURCE_READY'
    | 'OCR_PDF_SOURCE_MISSING_DOCUMENT'
    | 'OCR_PDF_SOURCE_MISSING_BYTES'
    | 'OCR_PDF_SOURCE_WORKING_BYTES_USED'
    | 'OCR_PDF_SOURCE_ORIGINAL_BYTES_USED'
    | 'OCR_PDF_SOURCE_SELECTED_PAGES_NORMALIZED'
    | 'OCR_PDF_SOURCE_SELECTED_PAGES_EMPTY'
    | 'OCR_PDF_SOURCE_PAGE_OUT_OF_RANGE';
  message: string;
}

export interface OcrPdfSourceSummary {
  hasDocument: boolean;
  hasPdfBytes: boolean;
  documentFingerprint: string | null;
  fileName: string | null;
  bytesSource: OcrPdfBytesSourceKind;
  pageCount: number;
  selectedPageCount: number;
}

export function getOcrPdfSourceFromSessionState(
  session: OcrPdfSessionLike,
  options: OcrPdfSourceBridgeOptions = {},
): OcrPdfSource {
  const diagnostics: OcrPdfSourceDiagnostic[] = [];
  const documentFingerprint = session.documentKey ?? null;
  const pageCount = Math.max(0, session.pageCount || 0);

  if (!documentFingerprint) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PDF_SOURCE_MISSING_DOCUMENT',
      message: 'No active PDF document is loaded for OCR.',
    });
  }

  const bytesResult = resolveOcrPdfBytesFromSession(session, options);

  diagnostics.push(...bytesResult.diagnostics);

  const selectedPageNumbers = normalizeSessionSelectedPageNumbers(
    session.selectedPages,
    pageCount,
  );

  const rejectedPageCount = session.selectedPages.filter(
    (pageNumber) => !Number.isInteger(pageNumber)
      || pageNumber < 1
      || pageNumber > Math.max(1, pageCount),
  ).length;

  if (rejectedPageCount > 0) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PDF_SOURCE_PAGE_OUT_OF_RANGE',
      message: `${rejectedPageCount} selected page number(s) were outside the active document range and skipped.`,
    });
  }

  if (selectedPageNumbers.length === 0) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PDF_SOURCE_SELECTED_PAGES_EMPTY',
      message: 'No explicit OCR pages selected; OCR will use the full active document range.',
    });
  } else if (
    selectedPageNumbers.length !== session.selectedPages.length
    || selectedPageNumbers.some((pageNumber, index) => pageNumber !== session.selectedPages[index])
  ) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PDF_SOURCE_SELECTED_PAGES_NORMALIZED',
      message: 'Selected PDF pages were normalized before OCR.',
    });
  }

  if (documentFingerprint && bytesResult.bytes) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PDF_SOURCE_READY',
      message: `OCR PDF source ready from ${bytesResult.source} PDF bytes.`,
    });
  }

  return {
    documentFingerprint,
    fileName: session.fileName ?? null,
    pdfBytes: bytesResult.bytes,
    bytesSource: bytesResult.source,
    pageCount,
    selectedPageNumbers,
    selectedPageIndexes: sessionPageNumbersToOcrPageIndexes(
      selectedPageNumbers,
      pageCount,
    ),
    hasPdfBytes: Boolean(bytesResult.bytes),
    diagnostics,
  };
}

export function resolveOcrPdfBytesFromSession(
  session: OcrPdfSessionLike,
  options: OcrPdfSourceBridgeOptions = {},
): {
  bytes: Uint8Array | null;
  source: OcrPdfBytesSourceKind;
  diagnostics: OcrPdfSourceDiagnostic[];
} {
  const preferWorkingCopy = options.preferWorkingCopy ?? true;
  const fallbackToOriginal = options.fallbackToOriginal ?? true;
  const diagnostics: OcrPdfSourceDiagnostic[] = [];

  if (preferWorkingCopy && hasBytes(session.workingBytes)) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PDF_SOURCE_WORKING_BYTES_USED',
      message: 'OCR will use the current working PDF bytes.',
    });

    return {
      bytes: cloneBytes(session.workingBytes),
      source: 'working',
      diagnostics,
    };
  }

  if (fallbackToOriginal && hasBytes(session.originalBytes)) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PDF_SOURCE_ORIGINAL_BYTES_USED',
      message: 'OCR will use the original PDF bytes.',
    });

    return {
      bytes: cloneBytes(session.originalBytes),
      source: 'original',
      diagnostics,
    };
  }

  diagnostics.push({
    level: 'warning',
    code: 'OCR_PDF_SOURCE_MISSING_BYTES',
    message: 'No PDF bytes are available for OCR rasterization.',
  });

  return {
    bytes: null,
    source: 'none',
    diagnostics,
  };
}

export function sessionPageNumbersToOcrPageIndexes(
  pageNumbers: number[],
  pageCount: number,
): number[] {
  return normalizeSessionSelectedPageNumbers(pageNumbers, pageCount).map(
    (pageNumber) => pageNumber - 1,
  );
}

export function ocrPageIndexesToSessionPageNumbers(
  pageIndexes: number[],
  pageCount: number,
): number[] {
  return [...new Set(
    pageIndexes
      .filter((pageIndex) =>
        Number.isInteger(pageIndex)
        && pageIndex >= 0
        && pageIndex < Math.max(1, pageCount),
      )
      .map((pageIndex) => pageIndex + 1),
  )].sort((a, b) => a - b);
}

export function normalizeSessionSelectedPageNumbers(
  pageNumbers: number[],
  pageCount: number,
): number[] {
  const maxPage = Math.max(1, pageCount);

  return [...new Set(
    pageNumbers.filter((pageNumber) =>
      Number.isInteger(pageNumber)
      && pageNumber >= 1
      && pageNumber <= maxPage,
    ),
  )].sort((a, b) => a - b);
}

export function createOcrPdfSourceSummary(
  source: OcrPdfSource,
): OcrPdfSourceSummary {
  return {
    hasDocument: Boolean(source.documentFingerprint),
    hasPdfBytes: source.hasPdfBytes,
    documentFingerprint: source.documentFingerprint,
    fileName: source.fileName,
    bytesSource: source.bytesSource,
    pageCount: source.pageCount,
    selectedPageCount: source.selectedPageNumbers.length,
  };
}

export function getOcrPageIndexesForPanel(input: {
  selectedPageIndexes: number[];
  pageCount: number;
}): number[] {
  if (input.selectedPageIndexes.length > 0) {
    return input.selectedPageIndexes;
  }

  return Array.from(
    { length: Math.max(1, input.pageCount) },
    (_, pageIndex) => pageIndex,
  );
}

function hasBytes(
  bytes: Uint8Array | null | undefined,
): bytes is Uint8Array {
  return Boolean(bytes && bytes.byteLength > 0);
}

function cloneBytes(
  bytes: Uint8Array | null | undefined,
): Uint8Array | null {
  if (!hasBytes(bytes)) {
    return null;
  }

  return new Uint8Array(bytes);
}
