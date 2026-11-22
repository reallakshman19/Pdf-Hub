import { describe, expect, it } from 'vitest';
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(rotation: 0 | 90 = 0, authoredInPdfHub = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  if (rotation) page.setRotation(degrees(rotation));

  const ap = doc.context.register(doc.context.flateStream(
    'q 1 0 0 RG 0 0 150 40 re S 0 20 m 30 20 l S Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 40], Resources: {} },
  ));
  const callout = doc.context.register(doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    IT: 'FreeTextCallout',
    P: page.ref,
    NM: PDFString.of('foreign-callout'),
    Rect: [20, 100, 170, 140],
    RD: [30, 0, 0, 0],
    CL: [20, 120, 50, 120],
    Contents: PDFString.of('Engineering callout'),
    RC: PDFString.of('<body><p>Engineering callout</p></body>'),
    DA: PDFString.of('/Helv 12 Tf 0 g'),
    AP: { N: ap },
    ...(authoredInPdfHub ? { PDFHubType: PDFString.of('callout') } : {}),
  }));
  const line = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Line', P: page.ref,
    NM: PDFString.of('foreign-line'), Rect: [40, 200, 120, 230],
    L: [40, 210, 120, 220], AP: { N: ap },
  }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([callout, line]));
  return doc.save();
}

describe('imported native annotation /AP preview metadata', () => {
  it('keeps the complete callout AP rectangle separate from the editable text body', async () => {
    const read = await readNativePdfAnnotations(await fixture());
    expect(read.annotations).toHaveLength(2);
    const callout = read.annotations.find((item) => item.type === 'callout')!;
    const line = read.annotations.find((item) => item.type === 'line')!;

    expect(callout.data.nativeAppearanceImported).toBe(true);
    expect(callout.data.nativeAppearanceRef).toMatch(/^\d+R\d*$/);
    expect(callout.data.nativeAppearanceRect).toEqual({
      x: 20, y: 260, width: 150, height: 40,
    });
    expect(callout.data.nativeAppearanceBodyRect).toEqual(callout.rect);
    expect(callout.rect).not.toEqual(callout.data.nativeAppearanceRect);
    expect(callout.data.nativeSourceRef).toMatch(/^\d+ 0 R$/);

    expect(line.data.nativeAppearanceImported).toBe(true);
    expect(line.data.nativeAppearanceRect).toEqual(line.rect);
    expect(line.data.nativeAppearanceRef).toMatch(/^\d+R\d*$/);
  });

  it('tracks rotated imported AP geometry in page-visual coordinates', async () => {
    const read = await readNativePdfAnnotations(await fixture(90));
    const callout = read.annotations.find((item) => item.type === 'callout')!;
    expect(callout.data.nativeAppearancePageRotation).toBe(90);
    expect(callout.data.nativeAppearanceRect).toBeDefined();
    expect(callout.data.nativeAppearanceRect?.width).toBe(40);
    expect(callout.data.nativeAppearanceRect?.height).toBe(150);
    expect(callout.data.nativeAppearanceBodyRect).toEqual(callout.rect);
  });

  it('preserves imported AP preview provenance after editable Save/reopen', async () => {
    const bytes = await fixture();
    const imported = (await readNativePdfAnnotations(bytes)).annotations;
    const saved = await writeNativePdfAnnotations(bytes, imported);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations;
    const callout = reopened.find((item) => item.type === 'callout')!;
    expect(callout.data.nativeAppearanceImported).toBe(true);
    expect(callout.data.nativeAppearanceRef).toBeDefined();
    expect(callout.data.nativeAppearanceRect).toEqual({
      x: 20, y: 260, width: 150, height: 40,
    });
  });

  it('does not freeze Pdf-Hub authored annotation previews', async () => {
    const read = await readNativePdfAnnotations(await fixture(0, true));
    const callout = read.annotations.find((item) => item.type === 'callout')!;
    expect(callout.data.nativeAppearanceRef).toBeDefined();
    expect(callout.data.nativeAppearanceImported).toBe(false);
  });
});
