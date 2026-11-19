import { describe, expect, it } from 'vitest';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function appearance(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const annotation = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const stream = annotation.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
  return new TextDecoder().decode(decodePDFRawStream(stream).decode());
}

describe('synthetic Oracle: stale generated stamp provenance', () => {
  it('preserves externally changed artwork and rejects a forged generated edit', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const model = { id: 'generated', type: 'stamp' as const, pageNumber: 1,
      rect: { x: 20, y: 40, width: 80, height: 30 },
      data: { text: 'APPROVED', borderColor: '#0000ff' }, createdAt: 1, updatedAt: 1 };
    const initial = await writeNativePdfAnnotations(await doc.save(), [model]);

    // Simulate another PDF editor replacing only the native AP, leaving custom metadata stale.
    const external = await PDFDocument.load(initial.bytes);
    const root = external.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const distinctiveArtwork = 'q 0 1 1 rg 0 0 80 30 re f Q\n';
    const form = external.context.register(external.context.flateStream(distinctiveArtwork, {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
    }));
    root.set(PDFName.of('AP'), external.context.obj({ N: form }));
    const externalBytes = await external.save();
    const imported = (await readNativePdfAnnotations(externalBytes)).annotations[0];
    expect(imported.data.nativeStampAppearanceKind).toBe('imported');
    expect(await appearance(externalBytes)).toEqual(distinctiveArtwork);

    const unchanged = await writeNativePdfAnnotations(externalBytes, [imported]);
    expect(await appearance(unchanged.bytes)).toEqual(distinctiveArtwork);
    const changed = { ...imported, data: { ...imported.data, nativeStampAppearanceKind: 'generated' as const, borderColor: '#ff0000' } };
    await expect(writeNativePdfAnnotations(externalBytes, [changed])).rejects.toThrow('Cannot safely replace an imported custom stamp appearance');
    await expect(writeNativePdfAnnotations(externalBytes, [{ ...imported, type: 'shape-rect' }]))
      .rejects.toThrow('Cannot safely convert this imported stamp');
  });
});
