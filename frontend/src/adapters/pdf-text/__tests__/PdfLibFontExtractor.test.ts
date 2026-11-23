import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { describe, expect, it } from 'vitest';
import {
  extractAllPageFonts,
  extractPdfFontFromPage,
} from '../PdfLibFontExtractor';

describe('PdfLibFontExtractor', () => {
  it('extracts embedded standard font metadata from PDF page resources', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([600, 400]);
    const font = await doc.embedFont(lib.StandardFonts.HelveticaBold);

    page.drawText('Test Header', {
      font,
      size: 16,
      x: 50,
      y: 350,
    });

    const pdfBytes = await doc.save();
    const loadedDoc = await lib.PDFDocument.load(pdfBytes);
    const loadedPage = loadedDoc.getPage(0);

    const allFonts = extractAllPageFonts(loadedPage, lib);
    expect(allFonts.size).toBeGreaterThan(0);

    // Look up the font resource name
    const [firstKey, firstMeta] = Array.from(allFonts.entries())[0];
    expect(firstMeta).toBeDefined();
    expect(firstMeta.cleanFontFamily).toBe('Helvetica');

    const directLookup = extractPdfFontFromPage(loadedPage, firstKey, lib);
    expect(directLookup).toBeDefined();
    expect(directLookup?.cleanFontFamily).toBe('Helvetica');
  });

  it('returns null gracefully when font resource does not exist', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([400, 300]);

    const res = extractPdfFontFromPage(page, 'NonExistentFont', lib);
    expect(res).toBeNull();
  });

  it('extracts Type0 composite font with descendant CIDFont and /ToUnicode stream', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([500, 500]);

    // Build a synthetic Type0 font structure in pdf-lib context
    const cmapSource = `
      begincmap
      1 begincodespacerange
      <0000> <FFFF>
      endcodespacerange
      1 beginbfchar
      <0001> <0048>
      endbfchar
      endcmap
    `;
    const toUnicodeStream = doc.context.flateStream(cmapSource);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    const cidFontDict = doc.context.obj({
      Type: lib.PDFName.of('Font'),
      Subtype: lib.PDFName.of('CIDFontType2'),
      BaseFont: lib.PDFName.of('ABCDEE+Calibri'),
      CIDSystemInfo: doc.context.obj({
        Registry: lib.PDFString.of('Adobe'),
        Ordering: lib.PDFString.of('Identity'),
        Supplement: lib.PDFNumber.of(0),
      }),
      DW: lib.PDFNumber.of(1000),
      W: doc.context.obj([lib.PDFNumber.of(1), doc.context.obj([lib.PDFNumber.of(600)])]),
    });
    const cidFontRef = doc.context.register(cidFontDict);

    const type0Dict = doc.context.obj({
      Type: lib.PDFName.of('Font'),
      Subtype: lib.PDFName.of('Type0'),
      BaseFont: lib.PDFName.of('ABCDEE+Calibri'),
      Encoding: lib.PDFName.of('Identity-H'),
      DescendantFonts: doc.context.obj([cidFontRef]),
      ToUnicode: toUnicodeRef,
    });
    const type0Ref = doc.context.register(type0Dict);

    const resources = doc.context.obj({
      Font: doc.context.obj({
        FCustom: type0Ref,
      }),
    });
    page.node.set(lib.PDFName.of('Resources'), resources);

    const meta = extractPdfFontFromPage(page, 'FCustom', lib);
    expect(meta).not.toBeNull();
    expect(meta?.cleanFontFamily).toBe('Calibri');
    expect(meta?.isSubset).toBe(true);
    expect(meta?.subtype).toBe('Type0');
    expect(meta?.encodingType).toBe('Identity-H');
    expect(meta?.cMap?.unicodeToCid.get('H')).toBe(1);
    expect(meta?.metrics.widths.get(1)).toBeCloseTo(0.6);
  });
});
