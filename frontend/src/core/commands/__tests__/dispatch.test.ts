import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  admitDonorPdfFiles,
  type AdmittedDonorPdf,
  type DonorCommandTarget,
} from '../../admission/donorPdf';
import { useAnnotationStore } from '../../annotations/store';
import type { PdfAnnotation } from '../../annotations/types';
import { useHistoryStore } from '../../document-history/store';
import { useSessionStore } from '../../session/store';
import { useWriterV2Store } from '../../writer-v2/writerV2Store';
import type { WriterElementV2 } from '../../writer-v2/types';
import { useOcrStore } from '../../ocr/ocrStore';
import type { OcrDocumentResult } from '../../ocr/types';
import {
  commandBus,
  resetCommandBusForTests,
} from '../bus';
import {
  materializePdfCommand,
  type CommandResources,
  type PdfCommandDraft,
  type PdfCommandSource,
} from '../types';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    hashBytes: vi.fn().mockImplementation(
      async (bytes: Uint8Array) => 'mock-hash-' + bytes.length,
    ),
  },
}));

const pdfMocks = vi.hoisted(() => ({
  rotatePages: vi.fn(),
  movePage: vi.fn(),
  reorderPages: vi.fn(),
  extractPages: vi.fn(),
  removePages: vi.fn(),
  insertAt: vi.fn(),
  insertBlankPage: vi.fn(),
  replacePage: vi.fn(),
  duplicatePages: vi.fn(),
  merge: vi.fn(),
  addHeaderFooterText: vi.fn(),
  drawTextOnPages: vi.fn(),
  drawRedactionBoxes: vi.fn(),
  countPages: vi.fn(),
  getPageSize: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    rotatePages: pdfMocks.rotatePages,
    movePage: pdfMocks.movePage,
    reorderPages: pdfMocks.reorderPages,
    extractPages: pdfMocks.extractPages,
    removePages: pdfMocks.removePages,
    insertAt: pdfMocks.insertAt,
    insertBlankPage: pdfMocks.insertBlankPage,
    replacePage: pdfMocks.replacePage,
    duplicatePages: pdfMocks.duplicatePages,
    merge: pdfMocks.merge,
    addHeaderFooterText: pdfMocks.addHeaderFooterText,
    drawTextOnPages: pdfMocks.drawTextOnPages,
    drawRedactionBoxes: pdfMocks.drawRedactionBoxes,
    countPages: pdfMocks.countPages,
    getPageSize: pdfMocks.getPageSize,
  },
}));

const pageGraphMocks = vi.hoisted(() => ({
  buildPageGraphFromPdfBytes: vi.fn(),
}));

vi.mock('@/core/pages/pageGraphAdmission', () => ({
  buildPageGraphFromPdfBytes: pageGraphMocks.buildPageGraphFromPdfBytes,
}));

function pageGraph(
  count: number,
  documentKey = 'test-doc',
  size = { width: 612, height: 792 },
) {
  return {
    pages: Array.from({ length: count }, (_, index) => ({
      pageId: `${documentKey}::stable::${index + 1}`,
      documentKey,
      originalPageNumber: index + 1,
      currentIndex: index,
      width: size.width,
      height: size.height,
      rotation: 0 as const,
    })),
  };
}

async function execute(
  draft: PdfCommandDraft,
  options?: {
    source?: PdfCommandSource;
    resources?: CommandResources;
    documentKey?: string;
  },
) {
  const documentKey = options?.documentKey
    ?? useSessionStore.getState().documentKey
    ?? 'test-doc';

  return commandBus.execute({
    command: materializePdfCommand(
      draft,
      options?.source ?? 'toolbar',
      documentKey,
      {
        createdAt: '2026-09-18T00:00:00.000Z',
      },
    ),
    resources: options?.resources,
  });
}

async function admitDonor(
  commandTarget: DonorCommandTarget,
  name = 'donor.pdf',
): Promise<AdmittedDonorPdf> {
  const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
  const file = {
    name,
    type: 'application/pdf',
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  } as unknown as File;

  const result = await admitDonorPdfFiles(
    [{ file }],
    'COMMAND_CALLER',
    commandTarget,
    { ownerDocumentKey: 'test-doc' },
  );

  if (result.outcome !== 'ACCEPTED') {
    throw new Error(`Donor admission failed: ${result.outcome}`);
  }

  return result.value.donors[0];
}

const TEST_ANNOTATION: PdfAnnotation = {
  id: 'annotation-1',
  type: 'highlight',
  pageNumber: 1,
  rect: { x: 10, y: 20, width: 30, height: 12 },
  data: {},
  createdAt: 1,
  updatedAt: 1,
};

function writerElement(id: string, pageIndex: number): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'test-doc',
    pageIndex,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: id,
    style: { zIndex: 1 },
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function ocrDocument(
  pageIndex: number,
  documentFingerprint = 'test-doc',
): OcrDocumentResult {
  return {
    documentFingerprint,
    createdAt: '2026-09-18T00:00:00.000Z',
    engineId: 'test',
    profileId: 'clean-scan',
    pages: [{
      status: 'success',
      pageIndex,
      pageNumber: pageIndex + 1,
      width: 612,
      height: 792,
      words: [{
        id: 'ocr-word',
        pageIndex,
        text: 'PIPE',
        normalizedText: 'pipe',
        confidence: 0.9,
        bbox: { x: 100, y: 200, width: 50, height: 20 },
      }],
      lines: [],
      blocks: [],
      diagnostics: [],
    }],
    diagnostics: [],
  };
}

describe('canonical command dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useWriterV2Store.getState().clearWriterV2();
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().openDocument({
      documentKey: 'test-doc',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 1, 1]),
      pageCount: 3,
      pageGraph: pageGraph(3),
    });
    pdfMocks.countPages.mockResolvedValue(3);
    pdfMocks.getPageSize.mockResolvedValue({ width: 612, height: 792 });
    pageGraphMocks.buildPageGraphFromPdfBytes.mockImplementation(
      async (_bytes: Uint8Array, documentKey: string) => pageGraph(3, documentKey),
    );
  });

  it('pushes canonical history and updates session for ROTATE_PAGES', async () => {
    pdfMocks.rotatePages.mockResolvedValue(new Uint8Array([2, 2, 2]));

    const result = await execute({
      type: 'ROTATE_PAGES',
      payload: { pageIndices: [0], angle: 90 },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]?.command.source).toBe('toolbar');
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2, 2, 2]));
    expect(useSessionStore.getState().documentKey).toBe('mock-hash-3');
    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      rotation: 90,
      documentKey: 'mock-hash-3',
    });
    expect(pdfMocks.getPageSize).not.toHaveBeenCalled();
  });

  it('does not mutate any store when annotation persistence fails', async () => {
    useAnnotationStore.getState().setAnnotations([TEST_ANNOTATION]);
    pdfMocks.rotatePages.mockResolvedValue(new Uint8Array([2, 2, 2]));
    persistenceMocks.saveAnnotations.mockRejectedValueOnce(
      new Error('IndexedDB quota exceeded'),
    );

    const result = await execute({
      type: 'ROTATE_PAGES',
      payload: { pageIndices: [0], angle: 90 },
    });

    expect(result.success).toBe(false);
    expect(result.mutated).toBe(false);
    expect(result.error?.details).toBe('transaction-stage=persistence');
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1, 1, 1]));
    expect(useSessionStore.getState().documentKey).toBe('test-doc');
    expect(useAnnotationStore.getState().annotations).toEqual([TEST_ANNOTATION]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('returns artifact and does not mutate for EXTRACT_PAGES', async () => {
    pdfMocks.extractPages.mockResolvedValue(new Uint8Array([9, 9, 9]));
    const beforeBytes = useSessionStore.getState().workingBytes;

    const result = await execute(
      {
        type: 'EXTRACT_PAGES',
        payload: { pageIndices: [0, 1] },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(false);
    expect(result.artifacts?.[0]?.kind).toBe('pdf');
    expect(result.artifacts?.[0]?.bytes).toEqual(new Uint8Array([9, 9, 9]));
    expect(useSessionStore.getState().workingBytes).toEqual(beforeBytes);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('splits pages and returns extracted artifact', async () => {
    pdfMocks.extractPages.mockResolvedValue(new Uint8Array([7, 7, 7]));
    pdfMocks.removePages.mockResolvedValue(new Uint8Array([4, 4, 4]));
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    const result = await execute({
      type: 'SPLIT_PAGES',
      payload: { pageIndices: [0] },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.artifacts?.[0]?.bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([4, 4, 4]));
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::2',
      'test-doc::stable::3',
    ]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('applies macro output through an out-of-band binary resource', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'test-doc',
      elements: [writerElement('macro-writer', 1)],
    });
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'test-doc',
      result: ocrDocument(1),
      selectedPageIndexes: [1],
    });
    const nextBytes = new Uint8Array([5, 5, 5]);
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    pageGraphMocks.buildPageGraphFromPdfBytes.mockResolvedValueOnce(
      pageGraph(4, 'macro-output'),
    );

    const result = await execute(
      {
        type: 'APPLY_WORKING_COPY',
        payload: {
          binaryResourceId: 'macro:final',
          nextPageCount: 4,
          reason: 'Macro run',
          macro: {
            recipeId: 'r1',
            recipeName: 'Recipe 1',
            stepCount: 2,
          },
          selectedPages: [2],
        },
      },
      {
        source: 'macro-runner',
        resources: {
          binaries: {
            'macro:final': nextBytes,
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.nextPageCount).toBe(4);
    expect(useSessionStore.getState().selectedPages).toEqual([2]);
    expect(useSessionStore.getState().pageGraph?.pages).toHaveLength(4);
    expect(useSessionStore.getState().pageGraph?.pages[0]?.pageId).toBe(
      'macro-output::stable::1',
    );
    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      id: 'macro-writer',
      pageId: 'macro-output::stable::2',
      pageIndex: 1,
    });
    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().corrections).toEqual([]);
    expect(useOcrStore.getState().regions).toEqual([]);
    expect(useOcrStore.getState().selectedPageIndexes).toEqual([]);
    expect(useHistoryStore.getState().undoStack[0]?.label).toBe('Macro run');
    expect(
      JSON.stringify(useHistoryStore.getState().undoStack[0]?.command),
    ).not.toContain('5,5,5');
  });

  it('rejects missing macro binary resources', async () => {
    const result = await execute({
      type: 'APPLY_WORKING_COPY',
      payload: {
        binaryResourceId: 'missing',
        reason: 'Macro run',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RESOURCE_MISSING');
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('returns validation error when delete is requested with empty page list', async () => {
    const result = await execute({
      type: 'DELETE_PAGES',
      payload: { pageIndices: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('returns no working document error when there is no active file', async () => {
    useSessionStore.getState().clearDocument();

    const result = await execute(
      {
        type: 'ROTATE_PAGES',
        payload: { pageIndices: [0], angle: 90 },
      },
      { documentKey: 'test-doc' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_WORKING_DOCUMENT');
  });

  it('rejects a stale document identity', async () => {
    const result = await execute(
      {
        type: 'ROTATE_PAGES',
        payload: { pageIndices: [0], angle: 90 },
      },
      { documentKey: 'old-doc' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('STALE_DOCUMENT');
    expect(pdfMocks.rotatePages).not.toHaveBeenCalled();
  });

  it('reorders pages by explicit order', async () => {
    useAnnotationStore.getState().setAnnotations([
      { ...TEST_ANNOTATION, id: 'page-one-note', pageNumber: 1 },
    ]);
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'test-doc',
      elements: [writerElement('page-one-writer', 0)],
    });
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'test-doc',
      result: ocrDocument(0),
      selectedPageIndexes: [0],
    });
    pdfMocks.reorderPages.mockResolvedValue(new Uint8Array([3, 2, 1]));

    const result = await execute(
      {
        type: 'REORDER_PAGES_BY_ORDER',
        payload: { order: [2, 1, 0] },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    expect(pdfMocks.reorderPages).toHaveBeenCalledWith(
      new Uint8Array([1, 1, 1]),
      [2, 1, 0],
    );
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::3',
      'test-doc::stable::2',
      'test-doc::stable::1',
    ]);
    expect(useAnnotationStore.getState().annotations[0]).toMatchObject({
      id: 'page-one-note',
      pageId: 'test-doc::stable::1',
      pageNumber: 3,
    });
    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      id: 'page-one-writer',
      pageId: 'test-doc::stable::1',
      pageIndex: 2,
    });
    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      pageIndex: 2,
      pageNumber: 3,
    });
    expect(useOcrStore.getState().selectedPageIndexes).toEqual([2]);
    expect(useOcrStore.getState().documentFingerprint).toBe('mock-hash-3');
  });

  it('inserts pages from an admitted donor through an execution resource', async () => {
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);
    const donor = await admitDonor('INSERT_PAGES');
    pdfMocks.insertAt.mockResolvedValue(new Uint8Array([1, 9, 1]));

    const result = await execute(
      {
        type: 'INSERT_PAGES',
        payload: {
          atIndex: 1,
          donorResourceId: 'donor:0',
        },
      },
      {
        resources: {
          donors: {
            'donor:0': donor,
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(pdfMocks.insertAt).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().pageGraph?.pages).toHaveLength(6);
    expect(
      useSessionStore.getState().pageGraph?.pages.slice(1, 4).every(
        (page) => page.pageId.includes('::insert::'),
      ),
    ).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(
      JSON.stringify(useHistoryStore.getState().undoStack[0]?.command),
    ).not.toContain(donor.fileName);
  });

  it('rejects a fabricated donor before PDF mutation or transaction commit', async () => {
    const fabricated = {
      inputIndex: 0,
      fileName: 'malformed.pdf',
      sourceBytes: 4,
      pageCount: 1,
      ownerDocumentKey: 'test-doc',
      commandTarget: 'INSERT_PAGES',
      handle: null,
    } as AdmittedDonorPdf;

    const result = await execute(
      {
        type: 'INSERT_PAGES',
        payload: {
          atIndex: 1,
          donorResourceId: 'donor:0',
        },
      },
      {
        resources: {
          donors: {
            'donor:0': fabricated,
          },
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ADMISSION_REJECTED');
    expect(pdfMocks.insertAt).not.toHaveBeenCalled();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('preserves admitted merge order and dispatches the mutation once', async () => {
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(9);
    const firstBytes = new TextEncoder().encode('%PDF-1.7\nfirst');
    const secondBytes = new TextEncoder().encode('%PDF-1.7\nsecond');
    const admitted = await admitDonorPdfFiles(
      [
        {
          file: {
            name: 'first.pdf',
            type: 'application/pdf',
            size: firstBytes.byteLength,
            arrayBuffer: vi.fn(async () => firstBytes.slice().buffer),
          } as unknown as File,
        },
        {
          file: {
            name: 'second.pdf',
            type: 'application/pdf',
            size: secondBytes.byteLength,
            arrayBuffer: vi.fn(async () => secondBytes.slice().buffer),
          } as unknown as File,
        },
      ],
      'COMMAND_CALLER',
      'MERGE_PDF',
      { ownerDocumentKey: 'test-doc' },
    );
    expect(admitted.outcome).toBe('ACCEPTED');
    if (admitted.outcome !== 'ACCEPTED') return;

    pdfMocks.merge.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    const result = await execute(
      {
        type: 'MERGE_PDF',
        payload: {
          donorResourceIds: ['donor:0', 'donor:1'],
        },
      },
      {
        resources: {
          donors: {
            'donor:0': admitted.value.donors[0],
            'donor:1': admitted.value.donors[1],
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(admitted.value.donors.map((donor) => donor.fileName)).toEqual([
      'first.pdf',
      'second.pdf',
    ]);
    expect(pdfMocks.merge).toHaveBeenCalledTimes(1);
    expect(pdfMocks.merge.mock.calls[0]?.[1]).toHaveLength(2);
    expect(useSessionStore.getState().pageGraph?.pages).toHaveLength(9);
    expect(
      useSessionStore.getState().pageGraph?.pages.slice(3).every(
        (page) => page.pageId.includes('::merge::'),
      ),
    ).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('replaces a page from an admitted donor exactly once', async () => {
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'test-doc',
      result: ocrDocument(0),
      selectedPageIndexes: [0],
    });
    const donor = await admitDonor('REPLACE_PAGE');
    pageGraphMocks.buildPageGraphFromPdfBytes.mockResolvedValueOnce(
      pageGraph(3, 'donor-replace', { width: 700, height: 900 }),
    );
    pdfMocks.replacePage.mockResolvedValue(new Uint8Array([4, 4, 4]));

    const result = await execute(
      {
        type: 'REPLACE_PAGE',
        payload: {
          atIndex: 0,
          donorResourceId: 'donor:0',
          donorPageIndex: 0,
        },
      },
      {
        source: 'thumbnail-menu',
        resources: {
          donors: {
            'donor:0': donor,
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(pdfMocks.replacePage).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      width: 700,
      height: 900,
    });
    expect(useOcrStore.getState().result?.pages).toEqual([]);
    expect(useOcrStore.getState().selectedPageIndexes).toEqual([]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('inserts blank pages', async () => {
    pdfMocks.insertBlankPage.mockResolvedValue(new Uint8Array([1, 0, 1]));
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const result = await execute({
      type: 'INSERT_BLANK_PAGE',
      payload: {
        atIndex: 1,
        size: { width: 595, height: 842 },
      },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.insertBlankPage).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().pageGraph?.pages).toHaveLength(4);
    expect(useSessionStore.getState().pageGraph?.pages[1]).toMatchObject({
      originalPageNumber: 0,
      width: 595,
      height: 842,
    });
    expect(useSessionStore.getState().pageGraph?.pages[1]?.pageId).toContain('::blank::1');
  });

  it('duplicates pages with new stable identities immediately after the source', async () => {
    useAnnotationStore.getState().setAnnotations([
      { ...TEST_ANNOTATION, id: 'duplicate-note', pageNumber: 2 },
    ]);
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'test-doc',
      elements: [writerElement('duplicate-writer', 1)],
    });
    pdfMocks.duplicatePages.mockResolvedValue(new Uint8Array([8, 8, 8]));
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const result = await execute({
      type: 'DUPLICATE_PAGES',
      payload: { pageIndices: [1] },
    });

    expect(result.success).toBe(true);
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::1',
      'test-doc::stable::2',
      expect.stringContaining('::duplicate::1'),
      'test-doc::stable::3',
    ]);
    expect(useAnnotationStore.getState().annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'duplicate-note',
        pageId: 'test-doc::stable::2',
        pageNumber: 2,
      }),
      expect.objectContaining({
        pageId: expect.stringContaining('::duplicate::1'),
        pageNumber: 3,
      }),
    ]));
    expect(useWriterV2Store.getState().elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'duplicate-writer',
        pageId: 'test-doc::stable::2',
        pageIndex: 1,
      }),
      expect.objectContaining({
        pageId: expect.stringContaining('::duplicate::1'),
        pageIndex: 2,
      }),
    ]));
  });

  it('uses one permutation for single-page reorder bytes, overlays, and PageGraph', async () => {
    pdfMocks.reorderPages.mockResolvedValue(new Uint8Array([6, 6, 6]));

    const result = await execute({
      type: 'REORDER_PAGES',
      payload: { fromIndex: 0, toIndex: 2 },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.movePage).not.toHaveBeenCalled();
    expect(pdfMocks.reorderPages).toHaveBeenCalledWith(
      new Uint8Array([1, 1, 1]),
      [1, 0, 2],
    );
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::2',
      'test-doc::stable::1',
      'test-doc::stable::3',
    ]);
  });

  it('does not apply PDF PageGraph remapping to a blank Writer document', async () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-during-pdf',
      pageCount: 1,
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: writerElement('blank-writer-element', 0),
    });
    pdfMocks.reorderPages.mockResolvedValue(new Uint8Array([7, 7, 7]));

    const result = await execute({
      type: 'REORDER_PAGES_BY_ORDER',
      payload: { order: [2, 1, 0] },
    });

    expect(result.success).toBe(true);
    expect(useWriterV2Store.getState().documentMeta?.mode).toBe('blankDocument');
    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      id: 'blank-writer-element',
      pageIndex: 0,
    });
    expect(useWriterV2Store.getState().elements[0]?.pageId).toBeUndefined();
  });

  it('adds header/footer text', async () => {
    pdfMocks.addHeaderFooterText.mockResolvedValue(new Uint8Array([2, 2, 2]));

    const result = await execute(
      {
        type: 'ADD_HEADER_FOOTER_TEXT',
        payload: {
          pageIndices: [0, 1],
          options: {
            zone: 'footer',
            text: 'Page {page}',
            align: 'center',
            marginX: 20,
            marginY: 20,
            fontSize: 10,
            pageNumberToken: true,
          },
        },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    expect(pdfMocks.addHeaderFooterText).toHaveBeenCalledTimes(1);
  });

  it('draws text on selected pages', async () => {
    pdfMocks.drawTextOnPages.mockResolvedValue(new Uint8Array([3, 3, 3]));

    const result = await execute(
      {
        type: 'DRAW_TEXT_ON_PAGES',
        payload: {
          pageIndices: [0],
          options: {
            text: 'REVIEW',
            x: 20,
            y: 30,
            fontSize: 12,
          },
        },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    expect(pdfMocks.drawTextOnPages).toHaveBeenCalledTimes(1);
  });

  it('labels visual-mask commands accurately', async () => {
    pdfMocks.drawRedactionBoxes.mockResolvedValue(new Uint8Array([4, 4, 4]));

    const result = await execute({
      type: 'DRAW_REDACTION_BOX',
      payload: {
        pageIndices: [0],
        options: {
          x: 20,
          y: 30,
          width: 120,
          height: 24,
          fillColor: '#000000',
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/visual mask/i);
    expect(result.message).toMatch(/not securely removed/i);
    expect(useHistoryStore.getState().undoStack[0]?.label).toBe('Draw visual mask');
  });

  it('returns validation error for empty header/footer target', async () => {
    const result = await execute(
      {
        type: 'ADD_HEADER_FOOTER_TEXT',
        payload: {
          pageIndices: [],
          options: {
            zone: 'footer',
            text: 'Page {page}',
            align: 'center',
            marginX: 20,
            marginY: 20,
            fontSize: 10,
          },
        },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });
});
