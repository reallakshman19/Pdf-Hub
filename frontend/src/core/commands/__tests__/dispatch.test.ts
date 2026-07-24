import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchCommand } from '../dispatch';
import { useAnnotationStore } from '../../annotations/store';
import type { PdfAnnotation } from '../../annotations/types';
import { useHistoryStore } from '../../document-history/store';
import { useSessionStore } from '../../session/store';

const persistenceMocks = vi.hoisted(() => ({
  saveAnnotations: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: persistenceMocks.saveAnnotations,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    hashBytes: vi.fn().mockImplementation(async (bytes) => 'mock-hash-' + bytes.length),
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

const TEST_ANNOTATION: PdfAnnotation = {
  id: 'annotation-1',
  type: 'highlight',
  pageNumber: 1,
  rect: { x: 10, y: 20, width: 30, height: 12 },
  data: {},
  createdAt: 1,
  updatedAt: 1,
};

describe('dispatchCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.saveAnnotations.mockResolvedValue(undefined);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useSessionStore.getState().openDocument({
      documentKey: 'test-doc',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 1, 1]),
      pageCount: 3,
    });
    pdfMocks.countPages.mockResolvedValue(3);
    pdfMocks.getPageSize.mockResolvedValue({ width: 612, height: 792 });
  });

  it('pushes history and updates session for ROTATE_PAGES', async () => {
    pdfMocks.rotatePages.mockResolvedValue(new Uint8Array([2, 2, 2]));

    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0].source).toBe('toolbar');
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([2, 2, 2]));
    expect(useSessionStore.getState().documentKey).toBe('mock-hash-3');
  });

  it('does not mutate any store when annotation persistence fails', async () => {
    useAnnotationStore.getState().setAnnotations([TEST_ANNOTATION]);
    pdfMocks.rotatePages.mockResolvedValue(new Uint8Array([2, 2, 2]));
    persistenceMocks.saveAnnotations.mockRejectedValueOnce(new Error('IndexedDB quota exceeded'));

    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
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
    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: { type: 'EXTRACT_PAGES', pageIndices: [0, 1] },
    });

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

    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'SPLIT_PAGES', pageIndices: [0] },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.artifacts?.[0]?.bytes).toEqual(new Uint8Array([7, 7, 7]));
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([4, 4, 4]));
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('applies REPLACE_WORKING_COPY as a history-backed mutation', async () => {
    const nextBytes = new Uint8Array([5, 5, 5]);
    pdfMocks.countPages.mockResolvedValue(4);

    const result = await dispatchCommand({
      source: 'macro-runner',
      command: {
        type: 'REPLACE_WORKING_COPY',
        nextBytes,
        nextPageCount: 4,
        reason: 'Macro run',
      },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(result.nextPageCount).toBe(4);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0].label).toBe('Macro run');
  });

  it('returns validation error when delete is requested with empty page list', async () => {
    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'DELETE_PAGES', pageIndices: [] },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('returns no working document error when there is no active file', async () => {
    useSessionStore.getState().clearDocument();

    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_WORKING_DOCUMENT');
  });

  it('reorders pages by explicit order', async () => {
    pdfMocks.reorderPages.mockResolvedValue(new Uint8Array([3, 2, 1]));

    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: { type: 'REORDER_PAGES_BY_ORDER', order: [2, 1, 0] },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.reorderPages).toHaveBeenCalledWith(new Uint8Array([1, 1, 1]), [2, 1, 0]);
  });

  it('inserts pages from another pdf', async () => {
    pdfMocks.insertAt.mockResolvedValue(new Uint8Array([1, 9, 1]));

    const result = await dispatchCommand({
      source: 'toolbar',
      command: {
        type: 'INSERT_PAGES',
        atIndex: 1,
        newBytes: new Uint8Array([9]),
      },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.insertAt).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('inserts blank pages', async () => {
    pdfMocks.insertBlankPage.mockResolvedValue(new Uint8Array([1, 0, 1]));

    const result = await dispatchCommand({
      source: 'toolbar',
      command: { type: 'INSERT_BLANK_PAGE', atIndex: 1, size: { width: 595, height: 842 } },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.insertBlankPage).toHaveBeenCalledTimes(1);
  });

  it('adds header/footer text', async () => {
    pdfMocks.addHeaderFooterText.mockResolvedValue(new Uint8Array([2, 2, 2]));

    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: {
        type: 'ADD_HEADER_FOOTER_TEXT',
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
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.addHeaderFooterText).toHaveBeenCalledTimes(1);
  });

  it('draws text on selected pages', async () => {
    pdfMocks.drawTextOnPages.mockResolvedValue(new Uint8Array([3, 3, 3]));

    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: {
        type: 'DRAW_TEXT_ON_PAGES',
        pageIndices: [0],
        options: {
          text: 'REVIEW',
          x: 20,
          y: 30,
          fontSize: 12,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.drawTextOnPages).toHaveBeenCalledTimes(1);
  });

  it('labels legacy redaction commands as visual masks', async () => {
    pdfMocks.drawRedactionBoxes.mockResolvedValue(new Uint8Array([4, 4, 4]));

    const result = await dispatchCommand({
      source: 'toolbar',
      command: {
        type: 'DRAW_REDACTION_BOX',
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
    const result = await dispatchCommand({
      source: 'thumbnail-menu',
      command: {
        type: 'ADD_HEADER_FOOTER_TEXT',
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
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
  });
});
