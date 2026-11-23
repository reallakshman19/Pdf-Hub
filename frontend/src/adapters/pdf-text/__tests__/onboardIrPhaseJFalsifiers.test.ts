import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { buildExistingTextSpan, createExistingTextDeleteIntent } from '@/core/existing-text/model';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';
import { matchExistingTextSpanToContentStream } from '@/core/existing-text/provenanceMatcher';
import { eraseExistingTextSpanInBytes } from '../PdfLibExistingTextErasure';
import { computeRotatedWhiteoutRect } from '@/core/existing-text/rotatedTextGeometry';
import { commandBus, resetCommandBusForTests } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';

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

describe('OnBoard IR Phase J Adversarial Falsifiers: Existing Text Erasure / Deletion & Content Stream Excision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    useHistoryStore.getState().clear();
    useSessionStore.getState().clearDocument();
  });

  it('Falsifier 1: Native Stream Excision deletes simple Tj text completely from content stream without leaving residue', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 100 200 Tm',
      '(TOP_SECRET_CODE) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-falsifier-1-excision';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'TOP_SECRET_CODE',
        transform: [12, 0, 0, 12, 100, 200],
        width: 120,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'native-excision');
    const { modifiedBytes, result } = await eraseExistingTextSpanInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      intent,
      provenance: (match as any).provenance,
      strategy: 'native-excision',
    });

    expect(result.success).toBe(true);
    expect(result.strategyApplied).toBe('native-excision');
    expect(result.originalText).toBe('TOP_SECRET_CODE');
    expect(result.bytesModified).toBe(true);
    expect(result.details.whiteoutEmitted).toBe(false);

    // Verify stream: (TOP_SECRET_CODE) Tj must be replaced with () Tj
    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(content).toContain('() Tj');
    expect(content).not.toContain('TOP_SECRET_CODE');
  });

  it('Falsifier 2: Visual Clearance Inpaint covers text completely with zero text emission', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 150 400 Tm',
      '(DEPRECATED PRICING) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-falsifier-2-inpaint';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'DEPRECATED PRICING',
        transform: [12, 0, 0, 12, 150, 400],
        width: 140,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'visual-inpaint');
    const { modifiedBytes, result } = await eraseExistingTextSpanInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      intent,
      provenance: (match as any).provenance,
      strategy: 'visual-inpaint',
    });

    expect(result.success).toBe(true);
    expect(result.strategyApplied).toBe('visual-inpaint');
    expect(result.visualClearanceProved).toBe(true);
    expect(result.details.whiteoutEmitted).toBe(true);

    // Verify stream: whiteout rect emitted, no replacement text operator drawn
    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(content).toContain('1 1 1 rg');
    expect(content).toContain('re');
    // Ensure no replacement text show operator was added
    const tjOccurrences = (content.match(/Tj/g) || []).length;
    expect(tjOccurrences).toBe(1); // Only original Tj remains (covered by whiteout)
  });

  it('Falsifier 3: Rotated Text Erasure applies rotated whiteout without clipping adjacent content', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '0 1 -1 0 100 200 Tm',
      '(ROTATED STAMP) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-falsifier-3-rotated';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'ROTATED STAMP',
        transform: [0, 12, -12, 0, 100, 200],
        width: 100,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'auto');
    const { modifiedBytes, result } = await eraseExistingTextSpanInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      intent,
      provenance: (match as any).provenance,
    });

    expect(result.success).toBe(true);
    expect(result.strategyApplied).toBe('visual-inpaint');
    expect(result.details.rotationDegrees).toBe(90);

    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Content stream has 90 degree cm rotate matrix for rectangle
    expect(content).toMatch(/0(\.0+)?\s+1(\.0+)?\s+-1(\.0+)?\s+0(\.0+)?/);

    // Verify geometric non-clipping of adjacent horizontal coordinate (130, 200):
    const whiteout = computeRotatedWhiteoutRect(
      span.originPt,
      span.advanceWidthPt,
      span.fontSizePt,
      90,
      2,
    );
    expect(whiteout.rotateDegrees).toBe(90);
    const testPointX = 130;
    const distanceToCenterline = Math.abs(testPointX - (span.originPt.x + span.fontSizePt / 2));
    expect(distanceToCenterline).toBeGreaterThan(whiteout.height); // completely clear!
  });

  it('Falsifier 4: DELETE_EXISTING_TEXT command bus execution successfully mutates document', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 72 700 Tm',
      '(COMMAND DELETE TARGET) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-falsifier-4-command';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'falsifier4.pdf',
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

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: `${documentKey}::stable::1`, pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'COMMAND DELETE TARGET',
        transform: [12, 0, 0, 12, 72, 700],
        width: 150,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'native-excision');
    const command = materializePdfCommand(
      {
        type: 'DELETE_EXISTING_TEXT',
        payload: {
          schemaVersion: 1,
          span,
          intent,
          provenance: (match as any).provenance,
          strategy: 'native-excision',
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
    expect(execResult.message).toContain('Deleted existing text');

    // Confirm that nextBytes has excised the target
    const updatedStreams = await readExistingTextPageContentStreams(execResult.nextBytes!, 0);
    const decoder = new TextDecoder('latin1');
    const content = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(content).toContain('() Tj');
    expect(content).not.toContain('COMMAND DELETE TARGET');
  });

  it('Falsifier 5: Atomic Undo / Redo restores excised text and stream content upon undo, and re-erases upon redo', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 72 700 Tm',
      '(ORIGINAL TEXT VALUE) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-falsifier-5-undo-redo';

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

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: `${documentKey}::stable::1`, pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'ORIGINAL TEXT VALUE',
        transform: [12, 0, 0, 12, 72, 700],
        width: 140,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'native-excision');
    const command = materializePdfCommand(
      {
        type: 'DELETE_EXISTING_TEXT',
        payload: {
          schemaVersion: 1,
          span,
          intent,
          provenance: (match as any).provenance,
          strategy: 'native-excision',
        },
      },
      'toolbar',
      documentKey,
    );

    // Initial state: contains ORIGINAL TEXT VALUE
    const initialTextDecoder = new TextDecoder('latin1');
    const initialContent = streams.streams.map((s) => initialTextDecoder.decode(s.decodedBytes)).join('\n');
    expect(initialContent).toContain('(ORIGINAL TEXT VALUE) Tj');

    // Apply deletion
    const deleteResult = await commandBus.execute({
      workingBytes: bytes,
      command,
    });
    expect(deleteResult.success).toBe(true);

    const mutatedBytes = useSessionStore.getState().workingBytes!;
    const mutatedStreams = await readExistingTextPageContentStreams(mutatedBytes, 0);
    const mutatedContent = mutatedStreams.streams.map((s) => initialTextDecoder.decode(s.decodedBytes)).join('\n');
    expect(mutatedContent).toContain('() Tj');
    expect(mutatedContent).not.toContain('ORIGINAL TEXT VALUE');

    // Undo action restores original bytes
    const undoSuccess = await applyUndo();
    expect(undoSuccess).toBe(true);
    const restoredBytes = useSessionStore.getState().workingBytes!;
    const restoredStreams = await readExistingTextPageContentStreams(restoredBytes, 0);
    const restoredContent = restoredStreams.streams.map((s) => initialTextDecoder.decode(s.decodedBytes)).join('\n');
    expect(restoredContent).toContain('(ORIGINAL TEXT VALUE) Tj');

    // Redo action re-applies deletion
    const redoSuccess = await applyRedo();
    expect(redoSuccess).toBe(true);
    const redoneBytes = useSessionStore.getState().workingBytes!;
    const redoStreams = await readExistingTextPageContentStreams(redoneBytes, 0);
    const redoContent = redoStreams.streams.map((s) => initialTextDecoder.decode(s.decodedBytes)).join('\n');
    expect(redoContent).toContain('() Tj');
    expect(redoContent).not.toContain('ORIGINAL TEXT VALUE');
  });
});
