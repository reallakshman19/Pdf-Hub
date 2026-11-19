import { describe, expect, it } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { attachNativeFreeTextAppearance } from './nativeFreeTextAppearance';
import type { PdfAnnotation } from '@/core/annotations/types';

async function appearance(width: number, size: number, italic: boolean, align: 'left' | 'center' | 'right' = 'left', family = 'Helvetica') {
  const doc = await pdfLib.PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const rect: [number, number, number, number] = [50, 50, 50 + width, 100];
  const dict = doc.context.obj({ Type: 'Annot', Subtype: 'FreeText', Rect: rect, P: page.ref,
    Contents: pdfLib.PDFString.of('f'), DA: pdfLib.PDFString.of('/Helv 20 Tf 0 0 0 rg'),
    RC: pdfLib.PDFHexString.fromText(`<body xmlns="http://www.w3.org/1999/xhtml" style="font-family:${family}"><p>f</p></body>`) });
  const annotation = { id: 'synthetic', type: 'textbox', pageNumber: 1,
    rect: { x: 50, y: 100, width, height: 50 },
    data: { text: 'f', fontSize: size, fontStyle: italic ? 'italic' : 'normal', textAlign: align },
    createdAt: 1, updatedAt: 1 } as PdfAnnotation;
  await attachNativeFreeTextAppearance(doc, dict, annotation, rect,
    { r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 1, 0, pdfLib);
  page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([doc.context.register(dict)]));
  const normal = dict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
  if (!(normal instanceof pdfLib.PDFRawStream)) throw new Error('Expected raw stream');
  const commands = new TextDecoder().decode(pdfLib.decodePDFRawStream(normal).decode());
  const match = /\/F\d+ ([\d.]+) Tf[\s\S]*?1 0 0 1 ([\d.]+) ([\d.]+) Tm/.exec(commands);
  if (!match) throw new Error('Expected text operation');
  return { bytes: await doc.save(), size: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
}

describe('native FreeText ink bounds', () => {
  it.each(['left', 'center', 'right'] as const)('reserves Helvetica-Oblique ink overhang when %s aligned', async (align) => {
    const tight = await appearance(12, 20, true, align);
    expect(tight.size).toBeLessThan(20);
    // FontBBox [-170, -225, 1116, 931] is a conservative enclosure for
    // every Helvetica-Oblique glyph, including both sides of italic f.
    expect(tight.x - 0.170 * tight.size).toBeGreaterThanOrEqual(2 - 1e-4);
    expect(tight.x + 1.116 * tight.size).toBeLessThanOrEqual(10 + 1e-4);
  });

  it.each(['Helvetica', 'Times', 'Courier'].flatMap((family) => [false, true].map((italic) => [family, italic] as const)))
  ('can compare tight and roomy %s italic=%s in a second renderer', async (family, italic) => {
    const tight = await appearance(12, 20, italic, 'left', family);
    const wide = await appearance(100, tight.size, italic, 'left', family);
    expect(wide.size).toBeCloseTo(tight.size, 4);
    expect(wide.x).toBeCloseTo(tight.x, 4);
    expect(wide.y).toBeCloseTo(tight.y, 4);
    if (process.env.WP01_FIT_RASTER_OUTPUT) {
      const { writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      writeFileSync(join(process.env.WP01_FIT_RASTER_OUTPUT, `synthetic-${family}-${italic}-tight.pdf`), tight.bytes);
      writeFileSync(join(process.env.WP01_FIT_RASTER_OUTPUT, `synthetic-${family}-${italic}-wide.pdf`), wide.bytes);
    }
  });
});
