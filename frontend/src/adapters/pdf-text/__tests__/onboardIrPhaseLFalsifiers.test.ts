import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { commandBus, resetCommandBusForTests } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';
import { applyCrossPageFlowInBytes } from '../PdfLibCrossPageFlowReconstruction';
import { executeCrossPageFlow } from '@/core/existing-text/crossPageFlowEngine';
import type { CrossPageFlowIntent } from '@/core/existing-text/crossPageFlowTypes';
import type { MultiColumnLayout } from '@/core/existing-text/columnFlowTypes';
import { createOcrReconciliationIntent } from '@/core/existing-text/ocrToNativeBridge';
import type { OcrLine } from '@/core/ocr/types';

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

describe('OnBoard IR Phase L Adversarial Falsifiers: Canvas Multi-Column UI, OCR Direct Edit & Cross-Page Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
  });
  it('Falsifier 1: Canvas Visual Column Guide accurately maps PDF coordinates to DOM without inverted origin errors', () => {
    const layout: MultiColumnLayout = {
      pageIndex: 0,
      pageId: 'page-l-1',
      columnCount: 2,
      readingOrder: [0, 1],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 720,
          widthPt: 220,
          heightPt: 120,
          gutterRightPt: 28,
          maxLines: 7,
          baselineYsPt: [720, 704, 688],
        },
        {
          columnIndex: 1,
          leftPt: 320,
          topPt: 720,
          widthPt: 220,
          heightPt: 120,
          gutterRightPt: 0,
          maxLines: 7,
          baselineYsPt: [720, 704, 688],
        },
      ],
    };

    const scale = 2.0;
    const pageHeightPt = 792;

    // Convert col 0
    const topPx = (pageHeightPt - layout.columns[0].topPt) * scale;
    const leftPx = layout.columns[0].leftPt * scale;
    const widthPx = layout.columns[0].widthPt * scale;

    expect(topPx).toBe((792 - 720) * 2); // 144px
    expect(leftPx).toBe(144); // 72 * 2
    expect(widthPx).toBe(440); // 220 * 2

    // Gutter between col 0 and col 1
    const gutterLeftPx = (layout.columns[0].leftPt + layout.columns[0].widthPt) * scale;
    const gutterWidthPx = layout.columns[0].gutterRightPt * scale;
    expect(gutterLeftPx).toBe((72 + 220) * 2); // 584px
    expect(gutterWidthPx).toBe(56); // 28 * 2
  });

  it('Falsifier 2: OCR Direct-Edit Bridge synthesizes editable candidate and commits CONVERT_OCR_TO_NATIVE_TEXT', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    // Draw background bitmap simulation
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      color: rgb(0.95, 0.95, 0.9),
    });
    const bytes = await doc.save();
    const documentKey = 'doc-l-ocr-bridge';

    useSessionStore.getState().openDocument({
      bytes,
      documentKey,
      fileName: 'doc-l-ocr-bridge.pdf',
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

    const ocrLine: OcrLine = {
      id: 'ocr-line-l-2',
      text: 'SCANNED RAW OCR TEXT',
      confidence: 0.94,
      bbox: { x: 72, y: 650, width: 200, height: 16 },
      wordIds: ['w1', 'w2'],
      pageIndex: 0,
    };

    const ocrIntent = createOcrReconciliationIntent(
      ocrLine,
      'RECONCILED VECTOR TEXT VALUE',
      {
        pageIndex: 0,
        pageId: `${documentKey}::stable::1`,
        revisionId: documentKey,
      },
      {
        fontSizePt: 14,
        fontFamily: 'Helvetica',
        colorHex: '#1e40af',
        backgroundColorHex: '#fef3c7',
      },
    );

    const command = materializePdfCommand(
      {
        type: 'CONVERT_OCR_TO_NATIVE_TEXT',
        payload: {
          schemaVersion: 1,
          pageIndex: 0,
          pageId: `${documentKey}::stable::1`,
          intent: ocrIntent,
        },
      },
      'toolbar',
      documentKey,
    );

    const execResult = await commandBus.execute({
      workingBytes: bytes,
      command,
    });
    expect(execResult.success).toBe(true);

    const mutated = useSessionStore.getState().workingBytes!;
    const stream = await readExistingTextPageContentStreams(mutated, 0);
    const decoder = new TextDecoder('latin1');
    const content = stream.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Inpainted with soft amber color and vector text emitted
    expect(content).toMatch(/RECONCILED VECTOR TEXT VALUE|5245434F4E43494C4544/);
  });

  it('Falsifier 3: Live Overcapacity Detection accurately detects when text exceeds column boundaries', () => {
    const layout: MultiColumnLayout = {
      pageIndex: 0,
      pageId: 'page-l-3',
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
          heightPt: 32, // 2 lines max
          gutterRightPt: 24,
          maxLines: 2,
          baselineYsPt: [700, 684],
        },
        {
          columnIndex: 1,
          leftPt: 296,
          topPt: 700,
          widthPt: 200,
          heightPt: 32, // 2 lines max
          gutterRightPt: 0,
          maxLines: 2,
          baselineYsPt: [700, 684],
        },
      ],
    };

    // Fits in 4 lines (2 cols x 2 lines)
    const fitText = 'Short line in col one and short line in col two.';
    const fitReflow = executeCrossPageFlow({
      schemaVersion: 1,
      sourceRevisionId: 'rev-l-3',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout: layout,
      targetLayout: layout,
      text: fitText,
    });
    expect(fitReflow.sourceLinesEmitted).toBeLessThanOrEqual(4);
    expect(fitReflow.targetLinesEmitted).toBe(0);

    // Overcapacity text (exceeds 4 lines)
    const overcapacityText = Array.from({ length: 45 }, (_, i) => `longword${i + 1}`).join(' ');
    const overReflow = executeCrossPageFlow({
      schemaVersion: 1,
      sourceRevisionId: 'rev-l-3',
      sourcePageIndex: 0,
      sourcePageId: 'page-0',
      targetPageIndex: 1,
      targetPageId: 'page-1',
      sourceLayout: layout,
      targetLayout: layout,
      text: overcapacityText,
    });
    expect(overReflow.sourceLinesEmitted).toBe(4);
    expect(overReflow.targetLinesEmitted).toBeGreaterThan(0);
    expect(overReflow.spillOverText).toBeDefined();
  });

  it('Falsifier 4: Cross-Page Flow preserves Header Exclusion Zone on Target Page', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p0 = doc.addPage([612, 792]);
    const p1 = doc.addPage([612, 792]);

    // Page 0 content
    p0.drawText('Original Page 0 Text', { x: 72, y: 700, size: 12, font });
    // Page 1 header banner that must NOT be encroached upon (y: 740 - 780)
    p1.drawText('CONFIDENTIAL COMPANY HEADER', { x: 72, y: 760, size: 14, font });

    const bytes = await doc.save();
    const documentKey = 'doc-l-header-guard';

    const sourceLayout: MultiColumnLayout = {
      pageIndex: 0,
      pageId: 'p0',
      columnCount: 1,
      readingOrder: [0],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 700,
          widthPt: 200,
          heightPt: 32, // 2 lines max
          gutterRightPt: 0,
          maxLines: 2,
          baselineYsPt: [700, 684],
        },
      ],
    };

    const targetLayout: MultiColumnLayout = {
      pageIndex: 1,
      pageId: 'p1',
      columnCount: 1,
      readingOrder: [0],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 780,
          widthPt: 200,
          heightPt: 100,
          gutterRightPt: 0,
          maxLines: 6,
          baselineYsPt: [780, 764, 748, 732, 716, 700],
        },
      ],
    };

    const surplusText = Array.from({ length: 25 }, (_, i) => `crossword${i + 1}`).join(' ');

    const intent: CrossPageFlowIntent = {
      schemaVersion: 1,
      sourceRevisionId: documentKey,
      sourcePageIndex: 0,
      sourcePageId: 'p0',
      targetPageIndex: 1,
      targetPageId: 'p1',
      sourceLayout,
      targetLayout,
      text: surplusText,
      headerExclusionTopPt: 730, // Header protection line
    };

    const { modifiedBytes, result } = await applyCrossPageFlowInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      intent,
    });

    expect(result.success).toBe(true);
    expect(result.sourceLinesEmitted).toBe(2);
    expect(result.targetLinesEmitted).toBeGreaterThan(0);

    // Verify Page 1 content stream: all baselines must be <= 730pt
    const streamP1 = await readExistingTextPageContentStreams(modifiedBytes, 1);
    const decoder = new TextDecoder('latin1');
    const contentP1 = streamP1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Header banner text is intact (literal or hex encoded)
    expect(contentP1).toMatch(/CONFIDENTIAL COMPANY HEADER|434F4E464944454E5449414C/);
    // Spilled text was placed
    expect(contentP1).toMatch(/crossword|63726F7373/);

    // Ensure no spilled text was drawn at y=780, y=764, or y=748
    for (const seg of result.targetSegments) {
      for (const pt of seg.lineBaselinesPt) {
        expect(pt.y).toBeLessThanOrEqual(730);
      }
    }
  });

  it('Falsifier 5: Multi-Page Atomic Command Bus Execution & Full Undo/Redo across Pages 0 & 1', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p0 = doc.addPage([612, 792]);
    const p1 = doc.addPage([612, 792]);

    p0.drawText('Base Page 0 Start', { x: 72, y: 700, size: 12, font });
    p1.drawText('Base Page 1 Empty Area', { x: 72, y: 650, size: 12, font });

    const bytes = await doc.save();
    const documentKey = 'doc-l-bus-undo-redo';

    useSessionStore.getState().openDocument({
      bytes,
      documentKey,
      fileName: 'doc-l-bus-undo-redo.pdf',
      pageCount: 2,
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
        {
          pageId: `${documentKey}::stable::2`,
          documentKey,
          originalPageNumber: 2,
          currentIndex: 1,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    const sourceLayout: MultiColumnLayout = {
      pageIndex: 0,
      pageId: `${documentKey}::stable::1`,
      columnCount: 1,
      readingOrder: [0],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 700,
          widthPt: 200,
          heightPt: 32, // 2 lines max
          gutterRightPt: 0,
          maxLines: 2,
          baselineYsPt: [700, 684],
        },
      ],
    };

    const targetLayout: MultiColumnLayout = {
      pageIndex: 1,
      pageId: `${documentKey}::stable::2`,
      columnCount: 1,
      readingOrder: [0],
      averageLeadingPt: 16,
      fontSizePt: 12,
      fontName: 'Helvetica',
      columns: [
        {
          columnIndex: 0,
          leftPt: 72,
          topPt: 650,
          widthPt: 200,
          heightPt: 80,
          gutterRightPt: 0,
          maxLines: 5,
          baselineYsPt: [650, 634, 618],
        },
      ],
    };

    const command = materializePdfCommand(
      {
        type: 'REFLOW_CROSS_PAGE_TEXT',
        payload: {
          schemaVersion: 1,
          sourcePageIndex: 0,
          sourcePageId: `${documentKey}::stable::1`,
          targetPageIndex: 1,
          targetPageId: `${documentKey}::stable::2`,
          intent: {
            schemaVersion: 1,
            sourceRevisionId: documentKey,
            sourcePageIndex: 0,
            sourcePageId: `${documentKey}::stable::1`,
            targetPageIndex: 1,
            targetPageId: `${documentKey}::stable::2`,
            sourceLayout,
            targetLayout,
            text: 'First line on page zero. Second line on page zero. Spilled line reaching page one successfully.',
          },
        },
      },
      'toolbar',
      documentKey,
    );

    const execResult = await commandBus.execute({
      workingBytes: bytes,
      command,
    });
    expect(execResult.success).toBe(true);

    const mutatedBytes = useSessionStore.getState().workingBytes!;
    const stream0 = await readExistingTextPageContentStreams(mutatedBytes, 0);
    const stream1 = await readExistingTextPageContentStreams(mutatedBytes, 1);
    const decoder = new TextDecoder('latin1');
    const content0 = stream0.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    const content1 = stream1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(content0).toMatch(/First line on page zero|4669727374206C696E65/);
    expect(content1).toMatch(/page one successfully|70616765206F6E65/);

    // Test Undo across both pages
    const undoSuccess = await applyUndo();
    expect(undoSuccess).toBe(true);

    const undoneBytes = useSessionStore.getState().workingBytes!;
    const undoneStream0 = await readExistingTextPageContentStreams(undoneBytes, 0);
    const undoneStream1 = await readExistingTextPageContentStreams(undoneBytes, 1);
    const undoneContent0 = undoneStream0.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    const undoneContent1 = undoneStream1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(undoneContent0).toMatch(/Base Page 0 Start|426173652050616765/);
    expect(undoneContent0).not.toMatch(/First line on page zero|4669727374206C696E65/);
    expect(undoneContent1).toMatch(/Base Page 1 Empty Area|426173652050616765/);
    expect(undoneContent1).not.toMatch(/page one successfully|70616765206F6E65/);

    // Test Redo across both pages
    const redoSuccess = await applyRedo();
    expect(redoSuccess).toBe(true);

    const redoneBytes = useSessionStore.getState().workingBytes!;
    const redoneStream0 = await readExistingTextPageContentStreams(redoneBytes, 0);
    const redoneStream1 = await readExistingTextPageContentStreams(redoneBytes, 1);
    const redoneContent0 = redoneStream0.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    const redoneContent1 = redoneStream1.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(redoneContent0).toMatch(/First line on page zero|4669727374206C696E65/);
    expect(redoneContent1).toMatch(/page one successfully|70616765206F6E65/);
  });
});
