import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createOcrPdfSourceSummary,
  getOcrPageIndexesForPanel,
  getOcrPdfSourceFromSessionState,
  normalizeSessionSelectedPageNumbers,
  ocrPageIndexesToSessionPageNumbers,
  resolveOcrPdfBytesFromSession,
  sessionPageNumbersToOcrPageIndexes,
} from '../ocrPdfSourceBridge';

describe('ocrPdfSourceBridge', () => {
  it('uses working bytes by default', () => {
    const source = getOcrPdfSourceFromSessionState({
      documentKey: 'doc-1',
      fileName: 'demo.pdf',
      originalBytes: new Uint8Array([1, 1, 1]),
      workingBytes: new Uint8Array([2, 2, 2]),
      pageCount: 3,
      selectedPages: [1, 3],
    });

    expect(source.documentFingerprint).toBe('doc-1');
    expect(source.fileName).toBe('demo.pdf');
    expect(source.bytesSource).toBe('working');
    expect(source.pdfBytes).toEqual(new Uint8Array([2, 2, 2]));
    expect(source.selectedPageNumbers).toEqual([1, 3]);
    expect(source.selectedPageIndexes).toEqual([0, 2]);
    expect(source.hasPdfBytes).toBe(true);
    expect(source.diagnostics.some((item) => item.code === 'OCR_PDF_SOURCE_READY')).toBe(true);
  });

  it('falls back to original bytes when working bytes are missing', () => {
    const result = resolveOcrPdfBytesFromSession({
      documentKey: 'doc-1',
      originalBytes: new Uint8Array([7, 8, 9]),
      workingBytes: null,
      pageCount: 1,
      selectedPages: [],
    });

    expect(result.source).toBe('original');
    expect(result.bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(result.diagnostics[0].code).toBe('OCR_PDF_SOURCE_ORIGINAL_BYTES_USED');
  });

  it('can prefer original bytes when configured', () => {
    const result = resolveOcrPdfBytesFromSession(
      {
        documentKey: 'doc-1',
        originalBytes: new Uint8Array([1]),
        workingBytes: new Uint8Array([2]),
        pageCount: 1,
        selectedPages: [],
      },
      {
        preferWorkingCopy: false,
      },
    );

    expect(result.source).toBe('original');
    expect(result.bytes).toEqual(new Uint8Array([1]));
  });

  it('returns missing bytes diagnostic when no bytes exist', () => {
    const source = getOcrPdfSourceFromSessionState({
      documentKey: 'doc-1',
      originalBytes: null,
      workingBytes: null,
      pageCount: 1,
      selectedPages: [],
    });

    expect(source.hasPdfBytes).toBe(false);
    expect(source.pdfBytes).toBeNull();
    expect(source.bytesSource).toBe('none');
    expect(source.diagnostics.some((item) => item.code === 'OCR_PDF_SOURCE_MISSING_BYTES')).toBe(true);
  });

  it('returns missing document diagnostic when document key is absent', () => {
    const source = getOcrPdfSourceFromSessionState({
      documentKey: null,
      originalBytes: new Uint8Array([1]),
      workingBytes: new Uint8Array([1]),
      pageCount: 1,
      selectedPages: [],
    });

    expect(source.documentFingerprint).toBeNull();
    expect(source.diagnostics.some((item) => item.code === 'OCR_PDF_SOURCE_MISSING_DOCUMENT')).toBe(true);
  });

  it('normalizes 1-based selected page numbers', () => {
    expect(
      normalizeSessionSelectedPageNumbers([3, 1, 1, 0, 99, 2], 3),
    ).toEqual([1, 2, 3]);
  });

  it('converts session page numbers to 0-based OCR page indexes', () => {
    expect(
      sessionPageNumbersToOcrPageIndexes([1, 3], 5),
    ).toEqual([0, 2]);
  });

  it('converts 0-based OCR page indexes to session page numbers', () => {
    expect(
      ocrPageIndexesToSessionPageNumbers([0, 2, 2, -1, 99], 5),
    ).toEqual([1, 3]);
  });

  it('reports out-of-range selected pages', () => {
    const source = getOcrPdfSourceFromSessionState({
      documentKey: 'doc-1',
      originalBytes: new Uint8Array([1]),
      workingBytes: new Uint8Array([1]),
      pageCount: 2,
      selectedPages: [1, 99],
    });

    expect(source.selectedPageNumbers).toEqual([1]);
    expect(source.selectedPageIndexes).toEqual([0]);
    expect(source.diagnostics.some((item) => item.code === 'OCR_PDF_SOURCE_PAGE_OUT_OF_RANGE')).toBe(true);
  });

  it('creates source summary', () => {
    const source = getOcrPdfSourceFromSessionState({
      documentKey: 'doc-1',
      fileName: 'demo.pdf',
      originalBytes: new Uint8Array([1]),
      workingBytes: new Uint8Array([1]),
      pageCount: 4,
      selectedPages: [2, 4],
    });

    const summary = createOcrPdfSourceSummary(source);

    expect(summary).toEqual({
      hasDocument: true,
      hasPdfBytes: true,
      documentFingerprint: 'doc-1',
      fileName: 'demo.pdf',
      bytesSource: 'working',
      pageCount: 4,
      selectedPageCount: 2,
    });
  });

  it('returns full document page indexes when no selected pages exist', () => {
    expect(
      getOcrPageIndexesForPanel({
        selectedPageIndexes: [],
        pageCount: 3,
      }),
    ).toEqual([0, 1, 2]);

    expect(
      getOcrPageIndexesForPanel({
        selectedPageIndexes: [2],
        pageCount: 3,
      }),
    ).toEqual([2]);
  });

  it('clones bytes to avoid mutating session bytes', () => {
    const workingBytes = new Uint8Array([1, 2, 3]);

    const source = getOcrPdfSourceFromSessionState({
      documentKey: 'doc-1',
      originalBytes: null,
      workingBytes,
      pageCount: 1,
      selectedPages: [],
    });

    expect(source.pdfBytes).not.toBe(workingBytes);

    if (!source.pdfBytes) {
      throw new Error('Expected cloned PDF bytes.');
    }

    source.pdfBytes[0] = 99;

    expect(workingBytes[0]).toBe(1);
  });
});
