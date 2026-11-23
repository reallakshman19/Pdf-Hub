import { describe, it, expect } from 'vitest';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  readExistingTextPageContentStreams,
} from '../PdfLibExistingTextContentStreams';
import {
  evaluateExistingTextUiCapability,
} from '../PdfLibExistingTextUiEvaluation';
import {
  applyReconstructedExistingTextReplacementToDocument,
} from '../PdfLibExistingTextReconstruction';
import {
  resolveBestMatchingStandard14Font,
} from '../PdfLibExistingTextFont';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

function createToUnicodeStream(doc: PDFDocument) {
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

  return doc.context.stream(cmapString);
}

describe('OnBoard IR Phase E Adversarial Falsifiers', () => {
  it('Falsifier 1: Type 0 font visual reconstruction fallback must resolve and embed standard font without throwing UNSUPPORTED_FONT_RESOURCE', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    const toUnicodeStream = createToUnicodeStream(doc);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    const cidFontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'CustomIdentityFont',
      CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 },
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

    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: type0FontRef }),
    }));

    // Solid white background + text
    const content = '1 1 1 rg 0 0 612 792 re f 0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm <00480065006C006C006F> Tj ET';
    const stream = doc.context.stream(content);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));

    const bytes = await doc.save();
    const documentKey = 'type0-fallback-doc';

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

    // Replacement text that overflows: 'Hello Beautiful Big World'
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Hello Beautiful Big World',
    });

    expect(capability.status).toBe('fallback-proved');
    if (capability.status === 'fallback-proved') {
      expect(capability.substituteFontName).toBe('Helvetica');
      // Execute the reconstruction mutation directly on document
      const loadedDoc = await PDFDocument.load(bytes);
      const lib = await pdfLib();
      const result = await applyReconstructedExistingTextReplacementToDocument(
        loadedDoc,
        lib,
        {
          currentRevisionId: documentKey,
          span,
          intent: capability.intent,
          provenance: capability.provenance,
        },
      );
      expect(result.originalText).toBe('Hello');
      expect(result.replacementText).toBe('Hello Beautiful Big World');
      expect(result.baseFont).toBe('Helvetica');

      // Verify the mutated document saves and parses cleanly
      const mutatedBytes = await loadedDoc.save();
      expect(mutatedBytes.length).toBeGreaterThan(bytes.length);
    }
  });

  it('Falsifier 2: Subset font with missing glyphs must be classified as fallback-proved when visual clearance is valid', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    // Limited CMap mapping only 'H', 'e', 'l', 'o'
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

    const bytes = await doc.save();
    const documentKey = 'subset-fallback-doc';

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

    // 'Héllü' contains 'é' and 'ü' missing from subset CMap
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Héllü',
    });

    // Instead of unavailable, smart font fallback proves visual clearance!
    expect(capability.status).toBe('fallback-proved');
    if (capability.status === 'fallback-proved') {
      expect(capability.fallbackReason).toBe('SUBSET_GLYPH_SUBSTITUTION');
      expect(capability.substituteFontName).toBe('Helvetica');
    }
  });

  it('Falsifier 3: Rich style overrides must be applied to reconstructed PDF output and reflected in page graphics', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);

    const content = '1 1 1 rg 0 0 612 792 re f 0 0 0 rg BT /F1 12 Tf 1 0 0 1 72 700 Tm (Sample) Tj ET';
    const stream = doc.context.stream(content);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: helvetica.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'style-override-doc';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Sample',
        transform: [12, 0, 0, 12, 72, 700],
        width: 36,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const styleOverride = {
      fontSizePt: 16,
      bold: true,
      colorHex: '#dc2626', // Red
    };

    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'Sample New',
      styleOverride,
    });

    expect(capability.status).toBe('fallback-proved');
    if (capability.status === 'fallback-proved') {
      expect(capability.fallbackReason).toBe('STYLE_OVERRIDE');

      const loadedDoc = await PDFDocument.load(bytes);
      const lib = await pdfLib();
      const result = await applyReconstructedExistingTextReplacementToDocument(
        loadedDoc,
        lib,
        {
          currentRevisionId: documentKey,
          span,
          intent: capability.intent,
          provenance: capability.provenance,
        },
      );

      expect(result.baseFont).toBe('Helvetica-Bold');
      const savedBytes = await loadedDoc.save();
      const readStreams = await readExistingTextPageContentStreams(savedBytes, 0);
      const fullContent = readStreams.streams
        .map((s) => new TextDecoder('latin1').decode(s.decodedBytes))
        .join('\n');
      expect(fullContent).toContain('16 Tf');
    }
  });

  it('Falsifier 4: Font family mapping integrity (Serif, Monospace, Sans-Serif with Bold & Italic)', () => {
    // 1. Serif fonts
    expect(resolveBestMatchingStandard14Font(null, 'Times-Roman')).toBe('Times-Roman');
    expect(resolveBestMatchingStandard14Font({
      resourceName: 'F1',
      baseFont: 'TimesNewRomanPS-BoldItalicMT',
      cleanFontFamily: 'Times New Roman',
      isSubset: false,
      subtype: 'TrueType',
      encodingType: 'WinAnsi',
      cMap: null,
      metrics: { defaultWidthPt: 600, widths: new Map(), unitsPerEm: 1000 },
      descriptor: { fontName: 'TimesNewRomanPS-BoldItalicMT', flags: 2 | 64 | 0x40000 },
    })).toBe('Times-BoldItalic');

    // 2. Monospace fonts
    expect(resolveBestMatchingStandard14Font(null, 'Courier')).toBe('Courier');
    expect(resolveBestMatchingStandard14Font({
      resourceName: 'F2',
      baseFont: 'Consolas-Bold',
      cleanFontFamily: 'Consolas',
      isSubset: false,
      subtype: 'TrueType',
      encodingType: 'WinAnsi',
      cMap: null,
      metrics: { defaultWidthPt: 600, widths: new Map(), unitsPerEm: 1000 },
      descriptor: { fontName: 'Consolas-Bold', flags: 1 | 0x40000 },
    })).toBe('Courier-Bold');

    // 3. Sans-Serif fonts
    expect(resolveBestMatchingStandard14Font(null, 'Arial')).toBe('Helvetica');
    expect(resolveBestMatchingStandard14Font({
      resourceName: 'F3',
      baseFont: 'Arial-ItalicMT',
      cleanFontFamily: 'Arial',
      isSubset: false,
      subtype: 'TrueType',
      encodingType: 'WinAnsi',
      cMap: null,
      metrics: { defaultWidthPt: 600, widths: new Map(), unitsPerEm: 1000 },
      descriptor: { fontName: 'Arial-ItalicMT', flags: 64 },
    })).toBe('Helvetica-Oblique');
  });
});
