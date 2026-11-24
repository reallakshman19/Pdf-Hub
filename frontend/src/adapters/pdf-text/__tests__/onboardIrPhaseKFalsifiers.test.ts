import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { buildExistingTextSpan } from '@/core/existing-text/model';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';
import { detectMultiColumnLayoutFromSpans } from '@/core/existing-text/columnFlowDetector';
import { applyMultiColumnParagraphReplacementInBytes } from '../PdfLibMultiColumnReconstruction';
import { synthesizeSpansFromOcrPage, createOcrReconciliationIntent } from '@/core/existing-text/ocrToNativeBridge';
import { reconcileOcrTextInBytes } from '../PdfLibOcrVectorReconciliation';
import { commandBus, resetCommandBusForTests } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';
import type { OcrPageResult } from '@/core/ocr/types';

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    hashBytes: vi.fn().mockImplementation(
      async (bytes: Uint8Array) => 'hash-' + bytes.length,
    ),
  },
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: vi.fn().mockResolvedValue(undefined),
  loadAnnotations: vi.fn().mockResolvedValue([]),
}));

describe('OnBoard IR Phase K Adversarial Falsifiers: Multi-Column Text Flow & OCR-to-Native Vector Reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
  });

  it('Falsifier 1: Multi-Column Layout Detection & Gutter Guard discovers valid columns and rejects overlapping bands', () => {
    const context = { revisionId: 'doc-k-1', pageId: 'page-1', pageIndex: 0 };

    // Valid 2-column layout:
    // Col 0: x in [72, 272]
    // Gutter: [272, 296] (width 24 >= 12)
    // Col 1: x in [296, 496]
    const validSpans = [
      buildExistingTextSpan(context, {
        sourceIndex: 0,
        text: 'Left Col Line 1',
        transform: [12, 0, 0, 12, 72, 700],
        width: 180,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 1,
        text: 'Left Col Line 2',
        transform: [12, 0, 0, 12, 72, 680],
        width: 175,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 2,
        text: 'Right Col Line 1',
        transform: [12, 0, 0, 12, 296, 700],
        width: 185,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 3,
        text: 'Right Col Line 2',
        transform: [12, 0, 0, 12, 296, 680],
        width: 180,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
    ];

    const detectedLayout = detectMultiColumnLayoutFromSpans(validSpans, 0, 'page-1');
    expect(detectedLayout).not.toBeNull();
    expect(detectedLayout?.columnCount).toBe(2);
    expect(detectedLayout?.columns[0].leftPt).toBe(72);
    expect(detectedLayout?.columns[0].gutterRightPt).toBe(44);
    expect(detectedLayout?.columns[1].leftPt).toBe(296);

    // Invalid overlapping spans with narrow gutter (< 12pt)
    const invalidSpans = [
      buildExistingTextSpan(context, {
        sourceIndex: 0,
        text: 'Col A 1',
        transform: [12, 0, 0, 12, 50, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 1,
        text: 'Col A 2',
        transform: [12, 0, 0, 12, 50, 680],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 2,
        text: 'Col B 1',
        transform: [12, 0, 0, 12, 206, 700], // 206 - 200 = 6pt gutter < 12pt
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
      buildExistingTextSpan(context, {
        sourceIndex: 3,
        text: 'Col B 2',
        transform: [12, 0, 0, 12, 206, 680],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: true,
      }),
    ];

    const rejectedLayout = detectMultiColumnLayoutFromSpans(invalidSpans, 0, 'page-1');
    expect(rejectedLayout).toBeNull();
  });

  it('Falsifier 2: Linked Column Overflow flows surplus text into Column 2 without margin bleed', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 72 700 Tm (Orig Col 1 Line 1) Tj',
      '1 0 0 1 72 680 Tm (Orig Col 1 Line 2) Tj',
      '1 0 0 1 296 700 Tm (Orig Col 2 Line 1) Tj',
      '1 0 0 1 296 680 Tm (Orig Col 2 Line 2) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-k-2-linked';

    // Layout where each column accepts at most 3 lines
    const layout = {
      pageIndex: 0,
      pageId: 'page-1',
      columnCount: 2,
      readingOrder: [0, 1],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 700,
          widthPt: 200,
          heightPt: 48, // 3 lines max
          gutterRightPt: 24,
          maxLines: 3,
          baselineYsPt: [700, 684, 668],
        },
        {
          columnIndex: 1,
          leftPt: 296,
          topPt: 700,
          widthPt: 200,
          heightPt: 48,
          gutterRightPt: 0,
          maxLines: 3,
          baselineYsPt: [700, 684, 668],
        },
      ],
    };

    // Text that will produce ~5 lines (exceeding Col 0 limit of 3 lines)
    const longReplacement =
      'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega end.';

    const { modifiedBytes, result } = await applyMultiColumnParagraphReplacementInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      pageIndex: 0,
      intent: {
        schemaVersion: 1,
        sourceRevisionId: documentKey,
        pageId: 'page-1',
        pageIndex: 0,
        originalText: 'Orig Col 1 Line 1',
        replacementText: longReplacement,
        layout,
      },
    });

    expect(result.success).toBe(true);
    expect(result.columnsUsed).toBe(2);
    expect(result.overflowsEntireLayout).toBe(false);
    expect(result.details.whiteoutRectsEmitted).toBe(2);

    // Verify stream: text was drawn in both column 0 (x=72) and column 1 (x=296)
    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(content).toContain('72 700');
    expect(content).toContain('296 700');
    expect(content).toMatch(/Alpha|416C706861/);

    // Negative control: overflowPolicy 'fail-closed' throws on overcapacity (Finding F-04)
    const superLongText = Array.from({ length: 80 }, (_, i) => `spilloverword${i}`).join(' ');
    await expect(
      applyMultiColumnParagraphReplacementInBytes({
        pdfBytes: bytes,
        currentRevisionId: documentKey,
        pageIndex: 0,
        intent: {
          schemaVersion: 1,
          sourceRevisionId: documentKey,
          pageId: 'page-1',
          pageIndex: 0,
          originalText: 'Orig Col 1 Line 1',
          replacementText: superLongText,
          layout,
          overflowPolicy: 'fail-closed',
        },
      }),
    ).rejects.toThrow(/LAYOUT_CAPACITY_EXCEEDED/);
  });

  it('Falsifier 3: OCR Text Double-Click Bridge synthesizes editable ExistingTextSpan candidates from OCR results', () => {
    const ocrPage: OcrPageResult = {
      status: 'success',
      pageNumber: 1,
      pageIndex: 0,
      pageId: 'doc-k-3::stable::1',
      blocks: [],
      lines: [
        {
          id: 'ocr-line-1',
          pageIndex: 0,
          text: 'SCANNED INVOICE TOTAL $5,432.10',
          confidence: 0.96,
          bbox: { x: 100, y: 650, width: 220, height: 16 },
          wordIds: ['w1', 'w2', 'w3', 'w4'],
        },
      ],
    };

    const context = {
      revisionId: 'doc-k-3',
      pageId: 'doc-k-3::stable::1',
      pageIndex: 0,
    };

    const spans = synthesizeSpansFromOcrPage(ocrPage, context);
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.id).toBe('ocr-span-ocr-line-1');
    expect(span.text).toBe('SCANNED INVOICE TOTAL $5,432.10');
    expect(span.editability).toBe('reconstructed-candidate');
    expect(span.originPt.x).toBe(100);
    expect(span.originPt.y).toBe(650);
    expect(span.advanceWidthPt).toBe(220);

    const intent = createOcrReconciliationIntent(ocrPage.lines![0], 'CORRECTED TOTAL $5,000.00', context);
    expect(intent.schemaVersion).toBe(1);
    expect(intent.originalOcrText).toBe('SCANNED INVOICE TOTAL $5,432.10');
    expect(intent.editedText).toBe('CORRECTED TOTAL $5,000.00');
    expect(intent.targetBoundsPt.width).toBe(220);
  });

  it('Falsifier 4: Raster Inpainting & Native Vector Text Synthesis purges bitmap area and appends native Tj operators', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    // Simulate background scan
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      color: rgb(0.9, 0.9, 0.9),
    });
    const bytes = await doc.save();
    const documentKey = 'doc-k-4-synth';

    const intent = {
      schemaVersion: 1 as const,
      sourceRevisionId: documentKey,
      pageIndex: 0,
      pageId: `${documentKey}::stable::1`,
      ocrBlockId: 'block-scan-1',
      ocrLineIndices: [0],
      originalOcrText: 'OLD BITMAP TEXT',
      editedText: 'SHARP CRISP VECTOR TEXT',
      targetBoundsPt: { x: 120, y: 500, width: 180, height: 14 },
      fontSizePt: 12,
      fontFamily: 'Helvetica',
      colorHex: '#000000',
      backgroundColorHex: '#fef3c7',
    };

    const { modifiedBytes, result } = await reconcileOcrTextInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      pageIndex: 0,
      intent,
    });

    expect(result.success).toBe(true);
    expect(result.rasterInpainted).toBe(true);
    expect(result.vectorTextSynthesized).toBe(true);
    expect(result.details.backgroundColorHex).toBe('#fef3c7');

    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Content stream has whiteout rectangle with descender protection padding (-2, -3)
    expect(content).toContain('118 497 cm');
    expect(content).toContain('184 19 l');
    // Content stream has native vector text show operator (literal or hex encoded)
    expect(content).toMatch(/SHARP CRISP VECTOR TEXT|5348415250/);
  });

  it('Falsifier 5: Atomic Command Bus Execution & Full Undo/Redo for Multi-Column & OCR Reconciliation mutations', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 72 700 Tm (Initial Text) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-k-5-bus';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'falsifier5.pdf',
      bytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: `${documentKey}::stable::1`,
          documentKey,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    // 1. Dispatch REPLACE_MULTI_COLUMN_PARAGRAPH
    const multiColCommand = materializePdfCommand(
      {
        type: 'REPLACE_MULTI_COLUMN_PARAGRAPH',
        payload: {
          schemaVersion: 1,
          pageIndex: 0,
          pageId: `${documentKey}::stable::1`,
          intent: {
            schemaVersion: 1,
            sourceRevisionId: documentKey,
            pageId: `${documentKey}::stable::1`,
            pageIndex: 0,
            originalText: 'Initial Text',
            replacementText: 'Multi Column Flow Text Here',
            layout: {
              pageIndex: 0,
              pageId: `${documentKey}::stable::1`,
              columnCount: 2,
              readingOrder: [0, 1],
              averageLeadingPt: 14,
              fontSizePt: 12,
              fontName: 'Helvetica',
              columns: [
                {
                  columnIndex: 0,
                  leftPt: 72,
                  topPt: 700,
                  widthPt: 200,
                  heightPt: 40,
                  gutterRightPt: 24,
                  maxLines: 2,
                  baselineYsPt: [700, 686],
                },
                {
                  columnIndex: 1,
                  leftPt: 296,
                  topPt: 700,
                  widthPt: 200,
                  heightPt: 40,
                  gutterRightPt: 0,
                  maxLines: 2,
                  baselineYsPt: [700, 686],
                },
              ],
            },
          },
        },
      },
      'toolbar',
      documentKey,
    );

    const execResult = await commandBus.execute({
      workingBytes: bytes,
      command: multiColCommand,
    });
    expect(execResult.success).toBe(true);

    const mutated1 = useSessionStore.getState().workingBytes!;
    const stream1 = await readExistingTextPageContentStreams(mutated1, 0);
    const decoder = new TextDecoder('latin1');
    const content1 = stream1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(content1).toMatch(/Multi Column Flow Text Here|4D756C7469/);

    // Test Undo multi-column
    const undo1 = await applyUndo();
    expect(undo1).toBe(true);
    const undoneBytes1 = useSessionStore.getState().workingBytes!;
    const streamUndone1 = await readExistingTextPageContentStreams(undoneBytes1, 0);
    const contentUndone1 = streamUndone1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(contentUndone1).toContain('(Initial Text) Tj');

    // Test Redo multi-column
    const redo1 = await applyRedo();
    expect(redo1).toBe(true);

    // 2. Dispatch CONVERT_OCR_TO_NATIVE_TEXT
    const currentDocKey = useSessionStore.getState().documentKey!;
    const stablePageId = useSessionStore.getState().pageGraph?.pages[0]?.pageId ?? `${documentKey}::stable::1`;
    const ocrCommand = materializePdfCommand(
      {
        type: 'CONVERT_OCR_TO_NATIVE_TEXT',
        payload: {
          schemaVersion: 1,
          pageIndex: 0,
          pageId: stablePageId,
          intent: {
            schemaVersion: 1,
            sourceRevisionId: currentDocKey,
            pageIndex: 0,
            pageId: stablePageId,
            ocrBlockId: 'b-ocr-5',
            ocrLineIndices: [0],
            originalOcrText: 'OCR Scanned Value',
            editedText: 'Clean Reconciled Vector Value',
            targetBoundsPt: { x: 72, y: 600, width: 160, height: 14 },
            fontSizePt: 12,
            fontFamily: 'Helvetica',
            colorHex: '#000000',
          },
        },
      },
      'toolbar',
      currentDocKey,
    );

    const ocrExecResult = await commandBus.execute({
      command: ocrCommand,
    });
    expect(ocrExecResult.success).toBe(true);

    const mutated2 = useSessionStore.getState().workingBytes!;
    const stream2 = await readExistingTextPageContentStreams(mutated2, 0);
    const content2 = stream2.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(content2).toMatch(/Clean Reconciled Vector Value|436C65616E/);

    // Test Undo OCR reconciliation
    const undo2 = await applyUndo();
    expect(undo2).toBe(true);
    const undoneBytes2 = useSessionStore.getState().workingBytes!;
    const streamUndone2 = await readExistingTextPageContentStreams(undoneBytes2, 0);
    const contentUndone2 = streamUndone2.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(contentUndone2).not.toMatch(/Clean Reconciled Vector Value|436C65616E/);

    // Test Redo OCR reconciliation
    const redo2 = await applyRedo();
    expect(redo2).toBe(true);
    const redoneBytes2 = useSessionStore.getState().workingBytes!;
    const streamRedone2 = await readExistingTextPageContentStreams(redoneBytes2, 0);
    const contentRedone2 = streamRedone2.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(contentRedone2).toMatch(/Clean Reconciled Vector Value|436C65616E/);
  });
});

describe('synthesizeSpansFromOcrPage geometry guard', () => {
  it('skips OCR lines that carry no usable bounding box instead of inventing a position', () => {
    const spans = synthesizeSpansFromOcrPage(
      {
        status: 'success',
        pageNumber: 1,
        pageIndex: 0,
        pageId: 'doc::stable::1',
        blocks: [],
        lines: [
          { id: 'has-box', pageIndex: 0, text: 'Placed', confidence: 0.9, bbox: { x: 10, y: 20, width: 50, height: 12 }, wordIds: [] },
          { id: 'zero-box', pageIndex: 0, text: 'Unplaceable', confidence: 0.9, bbox: { x: 0, y: 0, width: 0, height: 0 }, wordIds: [] },
        ],
      } as unknown as Parameters<typeof synthesizeSpansFromOcrPage>[0],
      { revisionId: 'doc', pageId: 'doc::stable::1', pageIndex: 0 },
    );
    expect(spans.map((span) => span.id)).toEqual(['ocr-span-has-box']);
  });
});
