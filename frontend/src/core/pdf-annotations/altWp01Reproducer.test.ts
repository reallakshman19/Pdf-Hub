import { describe, expect, it } from 'vitest';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString } from 'pdf-lib';

describe('ALT-WP01 Synthetic Reproducer — Imported /Stamp /AP Preservation', () => {
  it('preserves /AP on imported Stamp during no-op save', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const appearanceContent = 'q 0.2 0.4 0.8 rg 0 0 120 50 re f 1 1 1 rg 10 10 100 30 re f Q';
    const appearance = doc.context.stream(appearanceContent, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 120, 50],
      Resources: doc.context.obj({}),
    });
    const appearanceRef = doc.context.register(appearance);
    const stamp = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Stamp',
      Rect: [35, 60, 155, 110],
      Name: PDFName.of('SyntheticArtwork'),
      NM: PDFString.of('synthetic-stamp-001'),
      AP: doc.context.obj({ N: appearanceRef }),
      P: page.ref,
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(stamp)]));
    const inputBytes = await doc.save();

    const { annotations } = await readNativePdfAnnotations(inputBytes);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].id).toBe('synthetic-stamp-001');
    expect(annotations[0].type).toBe('stamp');
    expect(annotations[0].data.hasCustomAppearance).toBe(true);

    const writeResult = await writeNativePdfAnnotations(inputBytes, annotations);
    expect(writeResult.annotationCount).toBe(1);

    const outDoc = await PDFDocument.load(writeResult.bytes);
    const page0 = outDoc.getPage(0);
    const annots = page0.node.lookupMaybe(PDFName.of('Annots'), PDFArray) as PDFArray;
    expect(annots.size()).toBe(1);

    const annot0 = annots.lookup(0, PDFDict);
    expect(annot0.lookup(PDFName.of('Subtype'), PDFName).decodeText()).toBe('Stamp');
    const ap = annot0.lookup(PDFName.of('AP'), PDFDict);
    const normal = ap.lookup(PDFName.of('N'), PDFStream);
    if (!(normal instanceof PDFRawStream)) throw new Error('Expected a raw appearance stream');
    expect(normal.dict.lookup(PDFName.of('Subtype'), PDFName).decodeText()).toBe('Form');
    expect(normal.dict.lookup(PDFName.of('BBox'), PDFArray).asRectangle()).toEqual({ x: 0, y: 0, width: 120, height: 50 });
    expect(normal.dict.lookup(PDFName.of('Resources'), PDFDict)).toBeDefined();
    expect(new TextDecoder().decode(decodePDFRawStream(normal).decode())).toBe(appearanceContent);
  });
});
