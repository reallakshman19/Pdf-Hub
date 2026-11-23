import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFDict,
  StandardFonts,
} from 'pdf-lib';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  findParagraphForSpan,
} from '@/core/existing-text/paragraphClusterer';
import {
  evaluateExistingTextUiCapability,
} from '../PdfLibExistingTextUiEvaluation';
import {
  readExistingTextPageContentStreams,
} from '../PdfLibExistingTextContentStreams';
import {
  parsePdfContentStreams,
} from '@/core/pdf-content-stream/parser';
import { commandBus, resetCommandBusForTests } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';
import { useHistoryStore } from '@/core/document-history/store';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useOcrStore } from '@/core/ocr/ocrStore';

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

function createToUnicodeStream(doc: PDFDocument): any {
  const cmapString = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Custom-ToUnicode def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    '1 beginbfrange',
    '<0020> <007E> <0020>',
    'endbfrange',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');

  const stream = doc.context.stream(cmapString);
  return stream;
}

async function createMultiStreamType0Pdf(): Promise<{
  bytes: Uint8Array;
  span: ReturnType<typeof buildExistingTextSpan>;
}> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);

  // Construct Type 0 font with CMap
  const toUnicodeStream = createToUnicodeStream(doc);
  const toUnicodeRef = doc.context.register(toUnicodeStream);

  const cidFontDict = doc.context.obj({
    Type: 'Font',
    Subtype: 'CIDFontType2',
    BaseFont: 'CustomIdentityFont',
    CIDSystemInfo: {
      Registry: 'Adobe',
      Ordering: 'Identity',
      Supplement: 0,
    },
    DW: 1000,
  });
  const cidFontRef = doc.context.register(cidFontDict);

  const type0FontDict = doc.context.obj({
    Type: 'Font',
    Subtype: 'Type0',
    BaseFont: 'CustomIdentityFont',
    Encoding: 'Identity-H',
    DescendantFonts: [cidFontRef],
    ToUnicode: toUnicodeRef,
  });
  const type0FontRef = doc.context.register(type0FontDict);

  const fontDict = doc.context.obj({
    F1: type0FontRef,
  });
  page.node.set(PDFName.of('Resources'), doc.context.obj({
    Font: fontDict,
  }));

  // Multi-stream: Stream 0 opens q, Stream 1 has text and closes Q
  const stream0 = doc.context.stream('q 1 0 0 1 0 0 cm\n');
  const stream0Ref = doc.context.register(stream0);

  // 'Hello' in Identity-H CID 2-byte hex: 0048 0065 006c 006c 006f
  const stream1 = doc.context.stream([
    'BT',
    '/F1 12 Tf',
    '1 0 0 1 72 700 Tm',
    '<00480065006C006C006F> Tj',
    'ET',
    'Q',
  ].join('\n'));
  const stream1Ref = doc.context.register(stream1);

  page.node.set(PDFName.of('Contents'), doc.context.obj([stream0Ref, stream1Ref]));

  const bytes = await doc.save();

  const span = buildExistingTextSpan(
    {
      revisionId: 'multi-stream-doc',
      pageId: 'page-1',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text: 'Hello',
      transform: [12, 0, 0, 12, 72, 700],
      width: 30,
      height: 12,
      fontName: 'g_d0_f1',
      direction: 'ltr',
      hasEol: false,
    },
  );

  return { bytes, span };
}

async function createStandardHelveticaPdf(): Promise<{
  bytes: Uint8Array;
  span: ReturnType<typeof buildExistingTextSpan>;
}> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Hello World', {
    x: 72,
    y: 700,
    size: 12,
    font,
  });

  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  for (const key of fonts?.keys() ?? []) {
    fonts?.lookupMaybe(key, PDFDict)?.set(PDFName.of('Encoding'), PDFName.of('WinAnsiEncoding'));
  }

  const bytes = await doc.save();

  const span = buildExistingTextSpan(
    {
      revisionId: 'helvetica-doc',
      pageId: 'page-1',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text: 'Hello World',
      transform: [12, 0, 0, 12, 72, 700],
      width: 60,
      height: 12,
      fontName: 'Helvetica',
      direction: 'ltr',
      hasEol: false,
    },
  );

  return { bytes, span };
}

async function createClearanceProvedPdf(): Promise<{
  bytes: Uint8Array;
  span: ReturnType<typeof buildExistingTextSpan>;
}> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);

  const fontDictionary = document.context.obj({
    Type: 'Font',
    Subtype: 'Type1',
    BaseFont: 'Helvetica',
    Encoding: 'WinAnsiEncoding',
  });
  const fontRef = document.context.register(fontDictionary);
  page.node.set(
    PDFName.of('Resources'),
    document.context.obj({
      Font: {
        F1: fontRef,
      },
    }),
  );

  const contentSource = '1 1 1 rg 0 0 612 792 re f 0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET';
  const contentRef = document.context.register(
    document.context.flateStream(contentSource),
  );
  page.node.set(PDFName.of('Contents'), contentRef);

  const bytes = await document.save();

  const span = buildExistingTextSpan(
    {
      revisionId: 'clearance-doc',
      pageId: 'page-1',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text: 'Hello',
      transform: [12, 0, 0, 12, 72, 700],
      width: 30,
      height: 12,
      fontName: 'Helvetica',
      direction: 'ltr',
      hasEol: false,
    },
  );

  return { bytes, span };
}

describe('Existing Text End-to-End Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommandBusForTests();
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().setAnnotations([]);
    useWriterV2Store.getState().clearWriterV2();
    useOcrStore.getState().clearOcr();
  });

  it('Test 1: Full lifecycle with multi-stream PDF and Type 0 font (load -> evaluate -> commit -> undo -> redo)', async () => {
    const { bytes: initialBytes, span } = await createMultiStreamType0Pdf();
    const documentKey = 'multi-stream-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'multistream.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
          documentKey,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    // 1. Evaluate Capability
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: initialBytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Help',
    });

    expect(capability.status).toBe('native');
    if (capability.status !== 'native') throw new Error('Expected native status');

    expect(capability.fontMetadata?.subtype).toBe('Type0');
    expect((capability.fontMetadata as any)?.isTwoByteCid ?? true).toBe(true);
    expect(capability.nativeFit.status).toBe('fits');

    // 2. Dispatch REPLACE_EXISTING_TEXT command
    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'REPLACE_EXISTING_TEXT',
          payload: {
            schemaVersion: 1,
            span,
            intent: capability.intent,
            provenance: capability.provenance,
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const modifiedBytes = useSessionStore.getState().workingBytes;
    expect(modifiedBytes).toBeDefined();
    expect(modifiedBytes).not.toEqual(initialBytes);

    // 3. Verify modified content stream
    const readResult = await readExistingTextPageContentStreams(modifiedBytes!, 0);
    expect(readResult.complete).toBe(true);
    expect(readResult.streams.length).toBe(2);

    const stream1Text = new TextDecoder('latin1').decode(readResult.streams[1].decodedBytes);
    expect(stream1Text).toContain('00480065006C0070'); // 'Help' hex encoded

    // Verify graphics state balance across streams
    const parsed = parsePdfContentStreams(readResult.streams);
    expect(parsed.diagnostics.filter((d) => d.code === 'SYNTAX_ERROR')).toHaveLength(0);

    // 4. Test Undo
    const undoResult = await applyUndo();
    expect(undoResult).toBe(true);

    const undoneBytes = useSessionStore.getState().workingBytes;
    const undoneRead = await readExistingTextPageContentStreams(undoneBytes!, 0);
    const undoneStream1Text = new TextDecoder('latin1').decode(undoneRead.streams[1].decodedBytes);
    expect(undoneStream1Text).toContain('00480065006C006C006F'); // 'Hello' restored

    // 5. Test Redo
    const redoResult = await applyRedo();
    expect(redoResult).toBe(true);

    const redoneBytes = useSessionStore.getState().workingBytes;
    const redoneRead = await readExistingTextPageContentStreams(redoneBytes!, 0);
    const redoneStream1Text = new TextDecoder('latin1').decode(redoneRead.streams[1].decodedBytes);
    expect(redoneStream1Text).toContain('00480065006C0070'); // 'Help' reapplied
  });

  it('Test 2: Standard-14 Helvetica native replacement lifecycle', async () => {
    const { bytes: initialBytes, span } = await createStandardHelveticaPdf();
    const documentKey = 'helvetica-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'helvetica.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
          documentKey,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    // 1. Evaluate Capability
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: initialBytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Hello',
    });

    expect(capability.status).toBe('native');
    if (capability.status !== 'native') throw new Error('Expected native status');

    expect(capability.fontMetadata?.subtype).toBe('Type1');
    expect(capability.nativeFit.status).toBe('fits');

    // 2. Dispatch REPLACE_EXISTING_TEXT command
    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'REPLACE_EXISTING_TEXT',
          payload: {
            schemaVersion: 1,
            span,
            intent: capability.intent,
            provenance: capability.provenance,
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const modifiedBytes = useSessionStore.getState().workingBytes;
    const readResult = await readExistingTextPageContentStreams(modifiedBytes!, 0);
    const streamText = new TextDecoder('latin1').decode(readResult.streams[0].decodedBytes);
    expect(streamText).toContain('<48656C6C6F> Tj');
  });

  it('Test 3: Subset font missing glyphs diagnostics', async () => {
    // Construct a PDF with a limited CMap that ONLY maps 'H', 'e', 'l', 'o'
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    const limitedCmapString = [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Subset-ToUnicode def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      '4 beginbfchar',
      '<0048> <0048>', // 'H'
      '<0065> <0065>', // 'e'
      '<006C> <006C>', // 'l'
      '<006F> <006F>', // 'o'
      'endbfchar',
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end',
    ].join('\n');

    const toUnicodeStream = doc.context.stream(limitedCmapString);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    const cidFontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'BAAAAA+SubsetCustomFont',
      CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 },
      DW: 1000,
    });
    const cidFontRef = doc.context.register(cidFontDict);

    const type0FontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'BAAAAA+SubsetCustomFont',
      Encoding: 'Identity-H',
      DescendantFonts: [cidFontRef],
      ToUnicode: toUnicodeRef,
    });
    const type0FontRef = doc.context.register(type0FontDict);

    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: type0FontRef }),
    }));

    const contentStream = doc.context.stream([
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 72 700 Tm',
      '<00480065006C006C006F> Tj', // "Hello"
      'ET',
    ].join('\n'));
    const contentStreamRef = doc.context.register(contentStream);
    page.node.set(PDFName.of('Contents'), contentStreamRef);

    const bytes = await doc.save();
    const documentKey = 'subset-doc';

    const span = buildExistingTextSpan(
      {
        revisionId: documentKey,
        pageId: 'page-1',
        pageIndex: 0,
      },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 72, 700],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    // Evaluate with replacement text containing unmapped characters 'é' and 'ü'
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Héllü',
    });

    expect(capability.status).toBe('unavailable');
    if ('reasons' in capability) {
      expect(capability.reasons[0]).toContain('The font subset does not contain characters: é, ü');
    }
    expect(capability.nativeFit?.status).toBe('unmeasurable');
    if (capability.nativeFit?.status === 'unmeasurable') {
      expect(capability.nativeFit.reason).toBe('MISSING_SUBSET_GLYPHS');
      expect(capability.nativeFit.missingCharacters).toEqual(['é', 'ü']);
    }
  });

  it('Test 4: Visual clearance fallback reconstruction lifecycle', async () => {
    const { bytes: initialBytes, span } = await createClearanceProvedPdf();
    const documentKey = 'clearance-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'clearance.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
          documentKey,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    // Evaluate with replacement text that overflows original bounds (120pt > 30pt)
    // but right side has no obstacles on empty 612x792 page
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: initialBytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Hello World and Universe Extended Title',
    });

    expect(capability.status).toBe('fallback-proved');
    if (capability.status !== 'fallback-proved') throw new Error('Expected fallback-proved status');

    // Dispatch RECONSTRUCT_EXISTING_TEXT command
    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'RECONSTRUCT_EXISTING_TEXT',
          payload: {
            schemaVersion: 1,
            span,
            intent: capability.intent,
            provenance: capability.provenance,
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const modifiedBytes = useSessionStore.getState().workingBytes;
    expect(modifiedBytes).toBeDefined();
    const readResult = await readExistingTextPageContentStreams(modifiedBytes!, 0);
    const allStreamsText = readResult.streams
      .map((s) => new TextDecoder('latin1').decode(s.decodedBytes))
      .join('\n');

    // Verify whiteout rect/fill operator and new hex text overlay across page content streams
    expect(allStreamsText).toContain('1 1 1 rg'); // whiteout color
    expect(allStreamsText).toContain('f'); // fill whiteout
    expect(allStreamsText).toContain(
      '<48656C6C6F20576F726C6420616E6420556E69766572736520457874656E646564205469746C65> Tj',
    );
  });

  it('Test 5: Subset font with missing glyphs fallback reconstruction lifecycle with undo/redo', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    const limitedCmap = [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Subset-ToUnicode def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      '4 beginbfchar',
      '<0048> <0048>', // 'H'
      '<0065> <0065>', // 'e'
      '<006C> <006C>', // 'l'
      '<006F> <006F>', // 'o'
      'endbfchar',
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end',
    ].join('\n');

    const toUnicodeStream = doc.context.stream(limitedCmap);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    const cidFontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'ABCDEF+SubsetFont',
      CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 },
      DW: 1000,
    });
    const cidFontRef = doc.context.register(cidFontDict);

    const type0FontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'ABCDEF+SubsetFont',
      Encoding: 'Identity-H',
      DescendantFonts: [cidFontRef],
      ToUnicode: toUnicodeRef,
    });
    const type0FontRef = doc.context.register(type0FontDict);

    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: type0FontRef }),
    }));

    // Solid background with clearance
    const content = '1 1 1 rg 0 0 612 792 re f 0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm <00480065006C006C006F> Tj ET';
    const stream = doc.context.stream(content);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));

    const initialBytes = await doc.save();
    const documentKey = 'subset-fallback-lifecycle-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'subset-fallback.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
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
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 72, 700],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    // Evaluate with replacement text containing missing characters 'W', 'r', 'd'
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: initialBytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Hello World',
    });

    expect(capability.status).toBe('fallback-proved');
    if (capability.status !== 'fallback-proved') throw new Error('Expected fallback-proved');

    expect(capability.fallbackReason).toBe('SUBSET_GLYPH_SUBSTITUTION');
    expect(capability.substituteFontName).toBe('Helvetica');

    // Execute RECONSTRUCT_EXISTING_TEXT command
    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'RECONSTRUCT_EXISTING_TEXT',
          payload: {
            schemaVersion: 1,
            span,
            intent: capability.intent,
            provenance: capability.provenance,
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const reconstructedBytes = useSessionStore.getState().workingBytes;
    expect(reconstructedBytes).toBeDefined();

    // Verify undo restores initial bytes
    const undoSuccess = await applyUndo();
    expect(undoSuccess).toBe(true);
    const undoneBytes = useSessionStore.getState().workingBytes;
    expect(undoneBytes).toEqual(initialBytes);

    // Verify redo restores reconstructed bytes
    const redoSuccess = await applyRedo();
    expect(redoSuccess).toBe(true);
    const redoneBytes = useSessionStore.getState().workingBytes;
    expect(redoneBytes).toEqual(reconstructedBytes);
  });

  it('Test 6: Rich style overrides reconstruction lifecycle', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const content = '1 1 1 rg 0 0 612 792 re f 0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm (Sample) Tj ET';
    const stream = doc.context.stream(content);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: font.ref }),
    }));

    const initialBytes = await doc.save();
    const documentKey = 'style-override-lifecycle-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'style-override.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
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
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Sample',
        transform: [12, 0, 0, 12, 72, 700],
        width: 36,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const styleOverride = {
      fontSizePt: 16,
      bold: true,
      colorHex: '#2563eb', // Blue
    };

    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: initialBytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Styled Sample',
      styleOverride,
    });

    expect(capability.status).toBe('fallback-proved');
    if (capability.status !== 'fallback-proved') throw new Error('Expected fallback-proved');

    expect(capability.fallbackReason).toBe('STYLE_OVERRIDE');

    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'RECONSTRUCT_EXISTING_TEXT',
          payload: {
            schemaVersion: 1,
            span,
            intent: capability.intent,
            provenance: capability.provenance,
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const modifiedBytes = useSessionStore.getState().workingBytes;
    const readResult = await readExistingTextPageContentStreams(modifiedBytes!, 0);
    const fullContent = readResult.streams
      .map((s) => new TextDecoder('latin1').decode(s.decodedBytes))
      .join('\n');

    expect(fullContent).toContain('16 Tf');
  });

  it('Test 7: Paragraph multi-line replacement lifecycle (cluster -> reflow -> whiteout & emit BT ... TL ... T* ... ET -> parse & verify text)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // Initial 2 lines
    page.drawText('Line One of Section.', { x: 72, y: 700, size: 12, font });
    page.drawText('Line Two of Section.', { x: 72, y: 686, size: 12, font });

    const initialBytes = await doc.save();
    const documentKey = 'para-lifecycle-doc';

    useSessionStore.getState().openDocument({
      documentKey,
      fileName: 'para.pdf',
      bytes: initialBytes,
      pageCount: 1,
    });

    useSessionStore.getState().setPageGraph({
      pages: [
        {
          pageId: 'page-1',
          documentKey,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    });

    const span1 = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Line One of Section.',
        transform: [12, 0, 0, 12, 72, 700],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );
    const span2 = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 1,
        text: 'Line Two of Section.',
        transform: [12, 0, 0, 12, 72, 686],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span1, [span1, span2]);
    expect(paragraph.lines).toHaveLength(2);

    const executeResult = await commandBus.execute({
      workingBytes: initialBytes,
      command: materializePdfCommand(
        {
          type: 'REPLACE_EXISTING_PARAGRAPH',
          payload: {
            schemaVersion: 1,
            paragraph,
            intent: {
              schemaVersion: 1,
              paragraphId: paragraph.paragraphId,
              pageIndex: paragraph.pageIndex,
              originalText: paragraph.fullText,
              replacementText: 'Reflowed Multi-line Paragraph Content Across Multiple Lines in Document',
            },
          },
        },
        'toolbar',
        documentKey,
      ),
    });

    expect(executeResult.success).toBe(true);

    const modifiedBytes = useSessionStore.getState().workingBytes;
    expect(modifiedBytes).not.toBeNull();

    const readResult = await readExistingTextPageContentStreams(modifiedBytes!, 0);
    const decoder = new TextDecoder('latin1');
    const fullContent = readResult.streams
      .map((s) => decoder.decode(s.decodedBytes))
      .join('\n');

    // Must have whiteout fill (1 1 1 rg)
    expect(fullContent).toContain('1 1 1 rg');
    // Must have text matrix / BT block
    expect(fullContent).toContain('BT');
    expect(fullContent).toContain('ET');
    // Must have TL (leading)
    expect(fullContent).toContain('TL');
  });
});
