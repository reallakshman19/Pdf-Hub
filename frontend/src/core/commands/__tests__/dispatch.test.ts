import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  admitDonorPdfFiles,
  type AdmittedDonorPdf,
  type DonorCommandTarget,
} from '../../admission/donorPdf';
import { useAnnotationStore } from '../../annotations/store';
import type { PdfAnnotation } from '../../annotations/types';
import { useHistoryStore } from '../../document-history/store';
import { applyRedo, applyUndo } from '../../document-history/transactions';
import { useSessionStore } from '../../session/store';
import { useWriterV2Store } from '../../writer-v2/writerV2Store';
import type { WriterElementV2 } from '../../writer-v2/types';
import { useOcrStore } from '../../ocr/ocrStore';
import type { OcrDocumentResult } from '../../ocr/types';
import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '../../existing-text/model';
import {
  ExistingTextReplacementError,
} from '../../existing-text/replacementError';
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
  extractPages: vi.fn(),
  removePages: vi.fn(),
  countPages: vi.fn(),
  getPageSize: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    movePage: pdfMocks.movePage,
    extractPages: pdfMocks.extractPages,
    removePages: pdfMocks.removePages,
    countPages: pdfMocks.countPages,
    getPageSize: pdfMocks.getPageSize,
  },
}));

const mutationEngineMocks = vi.hoisted(() => ({
  open: vi.fn(),
  getPageMetrics: vi.fn(),
  rotatePages: vi.fn(),
  reorderPages: vi.fn(),
  removePages: vi.fn(),
  insertBlankPage: vi.fn(),
  duplicatePages: vi.fn(),
  insertPdf: vi.fn(),
  replacePage: vi.fn(),
  appendPdfs: vi.fn(),
  setPageLabels: vi.fn(),
  drawText: vi.fn(),
  drawVisualMasks: vi.fn(),
  applyHeaderFooter: vi.fn(),
  replaceExistingText: vi.fn(),
  reconstructExistingText: vi.fn(),
  commit: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@/adapters/pdf-mutation/PdfLibMutationEngine', () => ({
  pdfLibMutationEngine: {
    open: mutationEngineMocks.open,
  },
}));

const pageGraphMocks = vi.hoisted(() => ({
  buildPageGraphFromPdfBytes: vi.fn(),
}));

const headerFooterMutationMocks = vi.hoisted(() => ({
  prepareHeaderFooterTemplateMutation: vi.fn(),
}));

vi.mock('@/core/pages/pageGraphAdmission', () => ({
  buildPageGraphFromPdfBytes: pageGraphMocks.buildPageGraphFromPdfBytes,
}));

vi.mock('@/core/header-footer/executeMutation', () => ({
  prepareHeaderFooterTemplateMutation:
    headerFooterMutationMocks.prepareHeaderFooterTemplateMutation,
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
    id?: string;
    createdAt?: string;
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
        id: options?.id,
        createdAt:
          options?.createdAt
          ?? '2026-09-18T00:00:00.000Z',
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

function existingTextDraft(
  pageId =
    'test-doc::stable::1',
  replacementText = 'World',
): Extract<
  PdfCommandDraft,
  {
    type:
      'REPLACE_EXISTING_TEXT';
  }
> {
  const span =
    buildExistingTextSpan(
      {
        revisionId: 'test-doc',
        pageId,
        pageIndex: 0,
      },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [
          12, 0, 0, 12, 72, 700,
        ],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );
  const intent =
    createExistingTextEditIntent(
      span,
      replacementText,
    );
  return {
    type:
      'REPLACE_EXISTING_TEXT',
    payload: {
      schemaVersion: 1,
      span,
      intent,
      provenance: {
        streamIndex: 0,
        streamRef: '7 0 R',
        operatorIndex: 4,
        operator: 'Tj',
        operatorRange: {
          start: 18,
          end: 20,
        },
        operandRange: {
          start: 10,
          end: 17,
        },
        decodedText: 'Hello',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        fontSizePt: 12,
        textMatrix: [
          1, 0, 0, 1, 72, 700,
        ],
      },
    },
  };
}

function existingTextTjArrayDraft(
  pageId =
    'test-doc::stable::1',
  replacementText = 'World',
): Extract<
  PdfCommandDraft,
  {
    type:
      'REPLACE_EXISTING_TEXT';
  }
> {
  const span =
    buildExistingTextSpan(
      {
        revisionId: 'test-doc',
        pageId,
        pageIndex: 0,
      },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [
          12, 0, 0, 12, 72, 700,
        ],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );
  const intent =
    createExistingTextEditIntent(
      span,
      replacementText,
    );
  return {
    type:
      'REPLACE_EXISTING_TEXT',
    payload: {
      schemaVersion: 1,
      span,
      intent,
      provenance: {
        streamIndex: 0,
        streamRef: '7 0 R',
        operatorIndex: 4,
        operator: 'TJ',
        operatorRange: {
          start: 20,
          end: 22,
        },
        arrayRange: {
          start: 9,
          end: 18,
        },
        operandRange: {
          start: 10,
          end: 17,
        },
        decodedText: 'Hello',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        fontSizePt: 12,
        textMatrix: [
          1, 0, 0, 1, 72, 700,
        ],
      },
    },
  };
}

function reconstructedExistingTextDraft(
  pageId =
    'test-doc::stable::1',
  replacementText = 'World',
): Extract<
  PdfCommandDraft,
  {
    type:
      'RECONSTRUCT_EXISTING_TEXT';
  }
> {
  const native =
    existingTextDraft(
      pageId,
      replacementText,
    );
  if (
    native.type
    !== 'REPLACE_EXISTING_TEXT'
  ) {
    throw new Error(
      'Expected existing-text draft',
    );
  }
  return {
    ...native,
    type:
      'RECONSTRUCT_EXISTING_TEXT',
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
    mutationEngineMocks.getPageMetrics.mockImplementation(
      (_pageIndex: number) => ({
        width: 612,
        height: 792,
        rotation: 0,
      }),
    );
    mutationEngineMocks.commit.mockResolvedValue({
      bytes: new Uint8Array([2, 2, 2]),
      pageCount: 3,
    });
    mutationEngineMocks.open.mockImplementation(async () => ({
      pageCount: 3,
      getPageMetrics: mutationEngineMocks.getPageMetrics,
      rotatePages: mutationEngineMocks.rotatePages,
      reorderPages: mutationEngineMocks.reorderPages,
      removePages: mutationEngineMocks.removePages,
      insertBlankPage: mutationEngineMocks.insertBlankPage,
      duplicatePages: mutationEngineMocks.duplicatePages,
      insertPdf: mutationEngineMocks.insertPdf,
      replacePage: mutationEngineMocks.replacePage,
      appendPdfs: mutationEngineMocks.appendPdfs,
      setPageLabels: mutationEngineMocks.setPageLabels,
      drawText: mutationEngineMocks.drawText,
      drawVisualMasks: mutationEngineMocks.drawVisualMasks,
      applyHeaderFooter: mutationEngineMocks.applyHeaderFooter,
      replaceExistingText:
        mutationEngineMocks.replaceExistingText,
      reconstructExistingText:
        mutationEngineMocks.reconstructExistingText,
      commit: mutationEngineMocks.commit,
      dispose: mutationEngineMocks.dispose,
    }));
    pageGraphMocks.buildPageGraphFromPdfBytes.mockImplementation(
      async (_bytes: Uint8Array, documentKey: string) => pageGraph(3, documentKey),
    );
  });

  it('pushes canonical history and updates session for ROTATE_PAGES', async () => {
    useSessionStore.getState().setPageGraph({
      pages: pageGraph(3).pages.map((page, index) => ({
        ...page,
        logicalLabel: ['i', 'ii', '1'][index],
      })),
    });

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
      logicalLabel: 'i',
    });
    expect(pdfMocks.getPageSize).not.toHaveBeenCalled();
    expect(mutationEngineMocks.open).toHaveBeenCalledTimes(1);
    expect(mutationEngineMocks.getPageMetrics).toHaveBeenCalledWith(0);
    expect(mutationEngineMocks.rotatePages).toHaveBeenCalledWith(
      [0],
      90,
    );
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(mutationEngineMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not mutate any store when annotation persistence fails', async () => {
    useAnnotationStore.getState().setAnnotations([{ ...TEST_ANNOTATION, pageId: 'test-doc::stable::1' }]);
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'test-doc',
      result: ocrDocument(0),
      selectedPageIndexes: [0],
    });
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
    expect(useAnnotationStore.getState().annotations).toEqual([{ ...TEST_ANNOTATION, pageId: 'test-doc::stable::1' }]);
    expect(useOcrStore.getState().documentFingerprint).toBe('test-doc');
    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      pageIndex: 0,
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('routes existing-text replacement through the mutation session and canonical history', async () => {
    mutationEngineMocks
      .replaceExistingText
      .mockResolvedValue({
        pageIndex: 0,
        streamIndex: 0,
        streamRef: '7 0 R',
        originalText: 'Hello',
        replacementText: 'World',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        baseFont: 'Helvetica',
        proof: {
          originalOperandRange: {
            start: 10,
            end: 17,
          },
          replacementOperandRange: {
            start: 10,
            end: 17,
          },
          originalDecodedLength: 32,
          rewrittenDecodedLength: 32,
          prefixBytesPreserved: true,
          suffixBytesPreserved: true,
          contentTopology:
            'single-indirect',
          targetStreamIndirect: true,
          fit: {
            schemaVersion: 1,
            status: 'fits',
            baseFont:
              'Helvetica',
            sourceText: 'Hello',
            replacementText:
              'World',
            observedAdvancePt: 30,
            fontSizePt: 12,
            tolerancePt: 0.25,
            measuredSourceWidthPt: 27,
            measuredReplacementWidthPt: 27,
            observedToMetricScale:
              30 / 27,
            projectedReplacementAdvancePt: 30,
            overflowPt: 0,
          },
        },
      });

    const draft =
      existingTextDraft();
    const result =
      await execute(draft);

    expect(result).toMatchObject({
      success: true,
      mutated: true,
      commandType:
        'REPLACE_EXISTING_TEXT',
    });
    expect(
      mutationEngineMocks
        .replaceExistingText,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRevisionId:
          'test-doc',
        span:
          draft.payload.span,
        intent:
          draft.payload.intent,
        provenance:
          draft.payload
            .provenance,
      }),
    );
    expect(mutationEngineMocks.commit)
      .toHaveBeenCalledTimes(1);
    expect(
      useHistoryStore
        .getState()
        .undoStack.at(-1)
        ?.command.type,
    ).toBe(
      'REPLACE_EXISTING_TEXT',
    );
    expect(
      useSessionStore
        .getState()
        .documentKey,
    ).toBe('mock-hash-3');
    expect(
      useSessionStore
        .getState()
        .pageGraph
        ?.pages[0],
    ).toMatchObject({
      pageId:
        'test-doc::stable::1',
      documentKey:
        'mock-hash-3',
    });
  });

  it('dispatches REPLACE_EXISTING_TEXT for single-string TJ arrays', async () => {
    mutationEngineMocks
      .replaceExistingText
      .mockResolvedValue({
        pageIndex: 0,
        streamIndex: 0,
        streamRef: '7 0 R',
        originalText: 'Hello',
        replacementText:
          'World',
        encoding:
          'ascii-literal',
        baseFont:
          'Helvetica',
        proof: {
          contentTopology:
            'array-indirect',
          prefixBytesPreserved:
            true,
          suffixBytesPreserved:
            true,
          fit: {
            schemaVersion: 1,
            status: 'fits',
            baseFont:
              'Helvetica',
            sourceText: 'Hello',
            replacementText:
              'World',
            observedAdvancePt: 30,
            fontSizePt: 12,
            tolerancePt: 0.25,
            measuredSourceWidthPt: 27,
            measuredReplacementWidthPt: 27,
            observedToMetricScale:
              30 / 27,
            projectedReplacementAdvancePt: 30,
            overflowPt: 0,
          },
        },
      });

    const draft =
      existingTextTjArrayDraft();
    const result =
      await execute(draft);

    expect(result).toMatchObject({
      success: true,
      mutated: true,
      commandType:
        'REPLACE_EXISTING_TEXT',
    });
    expect(
      mutationEngineMocks
        .replaceExistingText,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance:
          expect.objectContaining({
            operator: 'TJ',
          }),
      }),
    );
    expect(
      useHistoryStore
        .getState()
        .undoStack.at(-1)
        ?.command.type,
    ).toBe(
      'REPLACE_EXISTING_TEXT',
    );
  });

  it('routes reconstructed existing text through its distinct canonical command', async () => {
    mutationEngineMocks
      .reconstructExistingText
      .mockResolvedValue({
        pageIndex: 0,
        originalText: 'Hello',
        replacementText:
          'World',
        fontResourceName:
          'F1',
        baseFont:
          'Helvetica',
        nativeFit: {
          schemaVersion: 1,
          status:
            'overflows',
          baseFont:
            'Helvetica',
          sourceText: 'Hello',
          replacementText:
            'World',
          observedAdvancePt: 30,
          fontSizePt: 12,
          tolerancePt: 0.25,
          measuredSourceWidthPt:
            27,
          measuredReplacementWidthPt:
            36,
          observedToMetricScale:
            30 / 27,
          projectedReplacementAdvancePt:
            40,
          overflowPt: 10,
        },
        evidence: {
          schemaVersion: 1,
          sourceRevisionId:
            'test-doc',
          pageId:
            'test-doc::stable::1',
          spanId:
            'existing-text:test-doc:test-doc::stable::1:0',
          sourceCoverage:
            'proved',
          clearanceRectPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
          background: {
            kind: 'solid',
            colorHex:
              '#ffffff',
          },
          foreignPaintIntersections:
            0,
          replacementBoundsPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
        },
        proof: {
          schemaVersion: 1,
          proofMode:
            'single-stream-solid-background-target-text-only',
          streamIndex: 0,
          streamRef:
            '7 0 R',
          targetOperatorIndex:
            4,
          operatorCount: 6,
          backgroundPaintOperatorIndex:
            2,
          backgroundRectPt: {
            x: 0,
            y: 0,
            width: 612,
            height: 792,
          },
          backgroundColorHex:
            '#ffffff',
          targetTextColorHex:
            '#000000',
          sourceBoundsPt: {
            x: 72,
            y: 697,
            width: 30,
            height: 15,
          },
          replacementBoundsPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
          clearanceRectPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
          foreignPaintIntersections:
            0,
        },
      });

    const draft =
      reconstructedExistingTextDraft();
    const result =
      await execute(draft);

    expect(result).toMatchObject({
      success: true,
      mutated: true,
      commandType:
        'RECONSTRUCT_EXISTING_TEXT',
    });
    expect(
      mutationEngineMocks
        .reconstructExistingText,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRevisionId:
          'test-doc',
        span:
          draft.payload.span,
        intent:
          draft.payload.intent,
        provenance:
          draft.payload
            .provenance,
      }),
    );
    expect(mutationEngineMocks.commit)
      .toHaveBeenCalledTimes(1);
    expect(
      useHistoryStore
        .getState()
        .undoStack.at(-1)
        ?.command.type,
    ).toBe(
      'RECONSTRUCT_EXISTING_TEXT',
    );
    expect(
      useSessionStore
        .getState()
        .workingBytes,
    ).toEqual(
      new Uint8Array([
        2,
        2,
        2,
      ]),
    );

    await expect(
      applyUndo(),
    ).resolves.toBe(true);
    expect(
      useSessionStore
        .getState()
        .workingBytes,
    ).toEqual(
      new Uint8Array([
        1,
        1,
        1,
      ]),
    );

    await expect(
      applyRedo(),
    ).resolves.toBe(true);
    expect(
      useSessionStore
        .getState()
        .workingBytes,
    ).toEqual(
      new Uint8Array([
        2,
        2,
        2,
      ]),
    );
  });

  it('rejects reconstructed existing-text PageId drift before mutation-session write', async () => {
    const result =
      await execute(
        reconstructedExistingTextDraft(
          'other-stable-page',
        ),
      );

    expect(result).toMatchObject({
      success: false,
      mutated: false,
      error: {
        code:
          'VALIDATION_FAILED',
      },
    });
    expect(
      mutationEngineMocks
        .reconstructExistingText,
    ).not.toHaveBeenCalled();
    expect(mutationEngineMocks.commit)
      .not.toHaveBeenCalled();
  });

  it('maps reconstructed proof loss to validation failure without commit', async () => {
    mutationEngineMocks
      .reconstructExistingText
      .mockRejectedValue(
        new ExistingTextReplacementError(
          'RECONSTRUCTED_VISUAL_CLEARANCE_UNPROVED',
          'clearance changed',
        ),
      );

    const result =
      await execute(
        reconstructedExistingTextDraft(),
      );

    expect(result).toMatchObject({
      success: false,
      mutated: false,
      error: {
        code:
          'VALIDATION_FAILED',
        message:
          'clearance changed',
      },
    });
    expect(
      mutationEngineMocks
        .reconstructExistingText,
    ).toHaveBeenCalledTimes(1);
    expect(
      mutationEngineMocks.commit,
    ).not.toHaveBeenCalled();
    expect(
      useHistoryStore
        .getState()
        .undoStack,
    ).toHaveLength(0);
  });

  it('rejects existing-text PageId drift before mutation-session write', async () => {
    const result =
      await execute(
        existingTextDraft(
          'other-stable-page',
        ),
      );

    expect(result).toMatchObject({
      success: false,
      mutated: false,
      error: {
        code:
          'VALIDATION_FAILED',
      },
    });
    expect(
      mutationEngineMocks
        .replaceExistingText,
    ).not.toHaveBeenCalled();
    expect(
      useHistoryStore
        .getState()
        .undoStack,
    ).toHaveLength(0);
  });

  it('maps bounded existing-text writer failures to validation failure without commit', async () => {
    mutationEngineMocks
      .replaceExistingText
      .mockRejectedValue(
        new ExistingTextReplacementError(
          'PROVENANCE_DRIFT',
          'provenance changed',
        ),
      );

    const result =
      await execute(
        existingTextDraft(),
      );

    expect(result).toMatchObject({
      success: false,
      mutated: false,
      error: {
        code:
          'VALIDATION_FAILED',
        message:
          'provenance changed',
      },
    });
    expect(mutationEngineMocks.commit)
      .not.toHaveBeenCalled();
    expect(
      useHistoryStore
        .getState()
        .undoStack,
    ).toHaveLength(0);
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
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([4, 4, 4]),
      pageCount: 2,
    });
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

  it('deletes pages through the mutation session', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([4, 4]),
      pageCount: 2,
    });

    const result = await execute({
      type: 'DELETE_PAGES',
      payload: { pageIndices: [1] },
    });

    expect(result.success).toBe(true);
    expect(mutationEngineMocks.removePages).toHaveBeenCalledWith(
      [1],
    );
    expect(
      useSessionStore
        .getState()
        .pageGraph?.pages.map((page) => page.pageId),
    ).toEqual([
      'test-doc::stable::1',
      'test-doc::stable::3',
    ]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(pdfMocks.countPages).not.toHaveBeenCalled();
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
    expect(mutationEngineMocks.open).not.toHaveBeenCalled();
  });

  it('reorders pages by explicit order', async () => {
    useSessionStore.getState().setPageGraph({
      pages: pageGraph(3).pages.map((page, index) => ({
        ...page,
        logicalLabel: ['i', 'ii', '1'][index],
      })),
    });
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
    useSessionStore.getState().setPage(1);
    useSessionStore.getState().setSelectedPages([1]);
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([3, 2, 1]),
      pageCount: 3,
    });

    const result = await execute(
      {
        type: 'REORDER_PAGES_BY_ORDER',
        payload: { order: [2, 1, 0] },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    expect(mutationEngineMocks.reorderPages).toHaveBeenCalledWith(
      [2, 1, 0],
    );
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::3',
      'test-doc::stable::2',
      'test-doc::stable::1',
    ]);
    expect(
      useSessionStore.getState().pageGraph?.pages.every(
        (page) => page.logicalLabel === undefined,
      ),
    ).toBe(true);
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
    expect(useSessionStore.getState().selectedPageIds).toEqual([
      'test-doc::stable::1',
    ]);
    expect(useSessionStore.getState().selectedPages).toEqual([3]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'test-doc::stable::1',
      currentPage: 3,
    });

    const transaction = useHistoryStore.getState().undoStack[0];
    expect(transaction?.before.selectedPageIds).toEqual(['test-doc::stable::1']);
    expect(transaction?.before.currentPageId).toBe('test-doc::stable::1');
    expect(transaction?.after.selectedPageIds).toEqual(['test-doc::stable::1']);
    expect(transaction?.after.currentPageId).toBe('test-doc::stable::1');

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().selectedPageIds).toEqual([
      'test-doc::stable::1',
    ]);
    expect(useSessionStore.getState().selectedPages).toEqual([1]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'test-doc::stable::1',
      currentPage: 1,
    });
    expect(useAnnotationStore.getState().annotations[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      pageNumber: 1,
    });
    expect(useWriterV2Store.getState().elements[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      pageIndex: 0,
    });
    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      pageIndex: 0,
    });

    await expect(applyRedo()).resolves.toBe(true);
    expect(useSessionStore.getState().selectedPages).toEqual([3]);
    expect(useSessionStore.getState().viewState).toMatchObject({
      currentPageId: 'test-doc::stable::1',
      currentPage: 3,
    });
  });

  it('inserts pages from an admitted donor through an execution resource', async () => {
    pdfMocks.countPages.mockResolvedValueOnce(3);
    const donor = await admitDonor('INSERT_PAGES');
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 9, 1]),
      pageCount: 6,
    });

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
    expect(mutationEngineMocks.insertPdf).toHaveBeenCalledWith(
      1,
      expect.any(Uint8Array),
    );
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
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
    expect(mutationEngineMocks.insertPdf).not.toHaveBeenCalled();
    expect(mutationEngineMocks.commit).not.toHaveBeenCalled();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('preserves admitted merge order and dispatches the mutation once', async () => {
    pdfMocks.countPages
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3);
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

    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 9,
    });

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
    expect(mutationEngineMocks.appendPdfs).toHaveBeenCalledTimes(1);
    expect(
      mutationEngineMocks.appendPdfs.mock.calls[0]?.[0],
    ).toHaveLength(2);
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().pageGraph?.pages).toHaveLength(9);
    expect(
      useSessionStore.getState().pageGraph?.pages.slice(3).every(
        (page) => page.pageId.includes('::merge::'),
      ),
    ).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('replaces a page from an admitted donor exactly once', async () => {
    useSessionStore.getState().setPageGraph({
      pages: pageGraph(3).pages.map((page, index) => ({
        ...page,
        logicalLabel: ['A-1', 'A-2', 'A-3'][index],
      })),
    });
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'test-doc',
      result: ocrDocument(0),
      selectedPageIndexes: [0],
    });
    const donor = await admitDonor('REPLACE_PAGE');
    pageGraphMocks.buildPageGraphFromPdfBytes.mockResolvedValueOnce(
      pageGraph(3, 'donor-replace', { width: 700, height: 900 }),
    );
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([4, 4, 4]),
      pageCount: 3,
    });

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
    expect(mutationEngineMocks.replacePage).toHaveBeenCalledWith(
      0,
      expect.any(Uint8Array),
      0,
    );
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().pageGraph?.pages[0]).toMatchObject({
      pageId: 'test-doc::stable::1',
      width: 700,
      height: 900,
      logicalLabel: 'A-1',
    });
    expect(useOcrStore.getState().result?.pages).toEqual([]);
    expect(useOcrStore.getState().selectedPageIndexes).toEqual([]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('inserts blank pages', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 0, 1]),
      pageCount: 4,
    });

    const result = await execute({
      type: 'INSERT_BLANK_PAGE',
      payload: {
        atIndex: 1,
        size: { width: 595, height: 842 },
      },
    });

    expect(result.success).toBe(true);
    expect(mutationEngineMocks.insertBlankPage).toHaveBeenCalledWith(
      1,
      { width: 595, height: 842 },
    );
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
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([8, 8, 8]),
      pageCount: 4,
    });

    const result = await execute(
      {
        type: 'DUPLICATE_PAGES',
        payload: { pageIndices: [1] },
      },
      {
        id: 'duplicate-command',
        createdAt:
          '2026-09-18T03:04:05.000Z',
      },
    );

    expect(result.success).toBe(true);
    expect(mutationEngineMocks.duplicatePages).toHaveBeenCalledWith(
      [1],
    );
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
        id:
          'duplicate-command::annotation-duplicate::1',
        pageId: expect.stringContaining('::duplicate::1'),
        pageNumber: 3,
        createdAt: Date.parse(
          '2026-09-18T03:04:05.000Z',
        ),
        updatedAt: Date.parse(
          '2026-09-18T03:04:05.000Z',
        ),
      }),
    ]));
    expect(useWriterV2Store.getState().elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'duplicate-writer',
        pageId: 'test-doc::stable::2',
        pageIndex: 1,
      }),
      expect.objectContaining({
        id:
          'duplicate-command::writer-duplicate::1',
        pageId: expect.stringContaining('::duplicate::1'),
        pageIndex: 2,
        createdAt:
          '2026-09-18T03:04:05.000Z',
        updatedAt:
          '2026-09-18T03:04:05.000Z',
      }),
    ]));
  });

  it('rejects structural mutation when PageGraph count disagrees with the opened PDF session', async () => {
    mutationEngineMocks.open.mockImplementationOnce(async () => ({
      pageCount: 2,
      getPageMetrics: mutationEngineMocks.getPageMetrics,
      rotatePages: mutationEngineMocks.rotatePages,
      reorderPages: mutationEngineMocks.reorderPages,
      removePages: mutationEngineMocks.removePages,
      insertBlankPage: mutationEngineMocks.insertBlankPage,
      duplicatePages: mutationEngineMocks.duplicatePages,
      commit: mutationEngineMocks.commit,
      dispose: mutationEngineMocks.dispose,
    }));

    const result = await execute({
      type: 'REORDER_PAGES',
      payload: { fromIndex: 0, toIndex: 1 },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EXECUTION_FAILED');
    expect(result.message).toMatch(/PageGraph count 3/);
    expect(mutationEngineMocks.reorderPages).not.toHaveBeenCalled();
    expect(mutationEngineMocks.commit).not.toHaveBeenCalled();
    expect(mutationEngineMocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses one permutation for single-page reorder bytes, overlays, and PageGraph', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([6, 6, 6]),
      pageCount: 3,
    });

    const result = await execute({
      type: 'REORDER_PAGES',
      payload: { fromIndex: 0, toIndex: 2 },
    });

    expect(result.success).toBe(true);
    expect(pdfMocks.movePage).not.toHaveBeenCalled();
    expect(mutationEngineMocks.reorderPages).toHaveBeenCalledWith(
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
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([7, 7, 7]),
      pageCount: 3,
    });

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

  it('sets and clears logical PageLabels through canonical history', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([9, 9, 9]),
      pageCount: 3,
    });

    const setResult = await execute({
      type: 'SET_PAGE_LABELS',
      payload: {
        ranges: [
          { startPageId: 'test-doc::stable::1', prefix: 'Cover' },
          { startPageId: 'test-doc::stable::2', style: 'roman-lower' },
          { startPageId: 'test-doc::stable::3', style: 'decimal' },
        ],
      },
    });

    expect(setResult.success).toBe(true);
    expect(mutationEngineMocks.setPageLabels).toHaveBeenCalledWith([
      { startPageIndex: 0, prefix: 'Cover' },
      { startPageIndex: 1, style: 'roman-lower' },
      { startPageIndex: 2, style: 'decimal' },
    ]);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([9, 9, 9]),
    );
    expect(useSessionStore.getState().pageGraph?.pageLabelRanges).toEqual([
      { startPageId: 'test-doc::stable::1', prefix: 'Cover' },
      { startPageId: 'test-doc::stable::2', style: 'roman-lower' },
      { startPageId: 'test-doc::stable::3', style: 'decimal' },
    ]);
    expect(
      useSessionStore.getState().pageGraph?.pages.map((page) => page.logicalLabel),
    ).toEqual(['Cover', 'i', '1']);
    expect(useHistoryStore.getState().undoStack[0]?.command.type).toBe(
      'SET_PAGE_LABELS',
    );

    await expect(applyUndo()).resolves.toBe(true);
    expect(useSessionStore.getState().pageGraph?.pageLabelRanges).toBeUndefined();
    expect(
      useSessionStore.getState().pageGraph?.pages.every(
        (page) => page.logicalLabel === undefined,
      ),
    ).toBe(true);

    await expect(applyRedo()).resolves.toBe(true);
    expect(
      useSessionStore.getState().pageGraph?.pages.map((page) => page.logicalLabel),
    ).toEqual(['Cover', 'i', '1']);

    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([8, 8, 8]),
      pageCount: 3,
    });
    mutationEngineMocks.setPageLabels.mockClear();
    const clearResult = await execute({
      type: 'SET_PAGE_LABELS',
      payload: { ranges: [] },
    });
    expect(clearResult.success).toBe(true);
    expect(mutationEngineMocks.setPageLabels).toHaveBeenCalledWith([]);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([8, 8, 8]),
    );
    expect(useSessionStore.getState().pageGraph?.pageLabelRanges).toEqual([]);
    expect(
      useSessionStore.getState().pageGraph?.pages.every(
        (page) => page.logicalLabel === undefined,
      ),
    ).toBe(true);
  });

  it('preserves canonical PageLabel ranges through explicit reorder and reserializes them', async () => {
    useSessionStore.getState().setPageGraph({
      pages: pageGraph(3).pages.map((page, index) => ({
        ...page,
        logicalLabel: ['Cover', 'i', '1'][index],
      })),
      pageLabelRanges: [
        { startPageId: 'test-doc::stable::1', prefix: 'Cover' },
        { startPageId: 'test-doc::stable::2', style: 'roman-lower' },
        { startPageId: 'test-doc::stable::3', style: 'decimal' },
      ],
    });
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([6, 6, 6]),
      pageCount: 3,
    });
    const result = await execute({
      type: 'REORDER_PAGES_BY_ORDER',
      payload: { order: [2, 1, 0] },
    });

    expect(result.success).toBe(true);
    expect(mutationEngineMocks.setPageLabels).toHaveBeenCalledWith([
      { startPageIndex: 0, style: 'decimal' },
      { startPageIndex: 1, style: 'roman-lower' },
      { startPageIndex: 2, prefix: 'Cover' },
    ]);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([6, 6, 6]),
    );
    expect(useSessionStore.getState().pageGraph?.pages.map((page) => page.pageId)).toEqual([
      'test-doc::stable::3',
      'test-doc::stable::2',
      'test-doc::stable::1',
    ]);
    expect(
      useSessionStore.getState().pageGraph?.pages.map((page) => page.logicalLabel),
    ).toEqual(['1', 'i', 'Cover']);
  });

  it('applies the canonical header/footer template through document history', async () => {
    const template = {
      schemaVersion: 1 as const,
      layout: {
        leftMarginPt: 36,
        rightMarginPt: 36,
        headerOffsetFromTopPt: 24,
        footerOffsetFromBottomPt: 24,
      },
      defaultTextStyle: {
        fontFamily: 'Helvetica',
        fontSizePt: 10,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
        color: '#202020',
        opacity: 1,
      },
      rules: [
        {
          id: 'body-footer',
          selector: { include: { mode: 'all' as const } },
          footer: {
            right: {
              kind: 'text' as const,
              template: 'Page {{physicalPage}}',
            },
          },
        },
      ],
    };
    const preparedPages = [
      {
        pageIndex: 0,
        layout: {
          leftMarginPt: 36,
          rightMarginPt: 36,
          headerOffsetFromTopPt: 24,
          footerOffsetFromBottomPt: 24,
        },
        footer: {
          right: {
            kind: 'text' as const,
            text: 'Page 1',
            style: {
              fontFamily: 'Helvetica',
              fontSizePt: 10,
              fontWeight: 'normal' as const,
              fontStyle: 'normal' as const,
              color: '#202020',
              opacity: 1,
            },
          },
        },
      },
    ];
    headerFooterMutationMocks.prepareHeaderFooterTemplateMutation.mockReturnValueOnce({
      ok: true,
      mutated: true,
      pages: preparedPages,
      binaryResources: {},
      warnings: [],
    });
    mutationEngineMocks.applyHeaderFooter.mockResolvedValueOnce({
      warnings: [],
    });
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([6, 6, 6]),
      pageCount: 3,
    });

    const result = await execute({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: { template },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(true);
    expect(
      headerFooterMutationMocks.prepareHeaderFooterTemplateMutation,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageId: 'test-doc::stable::1',
          }),
        ]),
      }),
      template,
      {
        fileName: 'test.pdf',
        now: new Date('2026-09-18T00:00:00.000Z'),
      },
      undefined,
    );
    expect(
      mutationEngineMocks.applyHeaderFooter,
    ).toHaveBeenCalledWith(
      preparedPages,
      {},
    );
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([6, 6, 6]),
    );
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack[0]?.command.type).toBe(
      'APPLY_HEADER_FOOTER_TEMPLATE',
    );
  });

  it('does not create history when a canonical header/footer template is a no-op', async () => {
    headerFooterMutationMocks.prepareHeaderFooterTemplateMutation.mockReturnValueOnce({
      ok: true,
      mutated: false,
      pages: [],
      binaryResources: {},
      warnings: ['Header/footer template matches no pages.'],
    });

    const result = await execute({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          schemaVersion: 1,
          layout: {
            leftMarginPt: 36,
            rightMarginPt: 36,
            headerOffsetFromTopPt: 24,
            footerOffsetFromBottomPt: 24,
          },
          defaultTextStyle: {
            fontFamily: 'Helvetica',
            fontSizePt: 10,
            fontWeight: 'normal',
            fontStyle: 'normal',
            color: '#202020',
            opacity: 1,
          },
          rules: [
            {
              id: 'none',
              selector: { include: { mode: 'all' } },
              footer: {
                center: {
                  kind: 'text',
                  template: '{{physicalPage}}',
                },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.mutated).toBe(false);
    expect(result.message).toMatch(/matches no pages/);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('maps missing canonical header/footer resources to RESOURCE_MISSING', async () => {
    headerFooterMutationMocks.prepareHeaderFooterTemplateMutation.mockReturnValueOnce({
      ok: false,
      code: 'RESOURCE_MISSING',
      errors: ['Header/footer binary resource is unavailable: logo'],
      warnings: [],
    });

    const result = await execute({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          schemaVersion: 1,
          layout: {
            leftMarginPt: 36,
            rightMarginPt: 36,
            headerOffsetFromTopPt: 24,
            footerOffsetFromBottomPt: 24,
          },
          defaultTextStyle: {
            fontFamily: 'Helvetica',
            fontSizePt: 10,
            fontWeight: 'normal',
            fontStyle: 'normal',
            color: '#202020',
            opacity: 1,
          },
          rules: [
            {
              id: 'logo',
              selector: { include: { mode: 'all' } },
              footer: {
                right: {
                  kind: 'image',
                  binaryResourceId: 'logo',
                  widthPt: 20,
                },
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('RESOURCE_MISSING');
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it('draws resolved text on selected pages through the mutation session', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([3, 3, 3]),
      pageCount: 3,
    });

    const result = await execute(
      {
        type: 'DRAW_TEXT_ON_PAGES',
        payload: {
          pageIndices: [0, 2],
          options: {
            text: 'Page {page} of {pages} — {file} — {date}',
            x: 20,
            y: 30,
            fontSize: 12,
            color: '#123456',
            opacity: 0.8,
            align: 'right',
            rotation: 90,
            fileNameToken: true,
            dateToken: true,
          },
        },
      },
      { source: 'thumbnail-menu' },
    );

    expect(result.success).toBe(true);
    const dateText = new Date(
      '2026-09-18T00:00:00.000Z',
    ).toLocaleDateString();
    expect(mutationEngineMocks.drawText).toHaveBeenCalledWith([
      {
        pageIndex: 0,
        text: `Page 1 of 3 — test.pdf — ${dateText}`,
        xPt: 20,
        yPt: 30,
        fontSizePt: 12,
        color: '#123456',
        opacity: 0.8,
        align: 'right',
        rotationDegrees: 90,
      },
      {
        pageIndex: 2,
        text: `Page 3 of 3 — test.pdf — ${dateText}`,
        xPt: 20,
        yPt: 30,
        fontSizePt: 12,
        color: '#123456',
        opacity: 0.8,
        align: 'right',
        rotationDegrees: 90,
      },
    ]);
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().workingBytes).toEqual(
      new Uint8Array([3, 3, 3]),
    );
  });

  it('labels visual-mask commands accurately and writes them through the mutation session', async () => {
    mutationEngineMocks.commit.mockResolvedValueOnce({
      bytes: new Uint8Array([4, 4, 4]),
      pageCount: 3,
    });

    const result = await execute({
      type: 'DRAW_REDACTION_BOX',
      payload: {
        pageIndices: [0, 2],
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
    expect(mutationEngineMocks.drawVisualMasks).toHaveBeenCalledWith([
      {
        pageIndex: 0,
        xPt: 20,
        yFromTopPt: 30,
        widthPt: 120,
        heightPt: 24,
        fillColor: '#000000',
      },
      {
        pageIndex: 2,
        xPt: 20,
        yFromTopPt: 30,
        widthPt: 120,
        heightPt: 24,
        fillColor: '#000000',
      },
    ]);
    expect(mutationEngineMocks.commit).toHaveBeenCalledTimes(1);
    expect(result.message).toMatch(/visual mask/i);
    expect(result.message).toMatch(/not securely removed/i);
    expect(useHistoryStore.getState().undoStack[0]?.label).toBe('Draw visual mask');
  });

});
