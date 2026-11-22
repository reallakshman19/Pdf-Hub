import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { useAnnotationStore } from '../annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

describe('imported note copy and edit', () => {
  it.each([false, true])('preserves the source and safely handles editing the copy when custom AP is %s', async (hasAppearance) => {
    const doc = await PDFDocument.create();
    const source = doc.addPage([300, 400]);
    doc.addPage([300, 400]);
    const dict = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 200, 70, 220],
      NM: PDFString.of('original-note'), Contents: PDFString.of('old note'), P: source.ref });
    if (hasAppearance) {
      const stream = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 20 20 re f Q',
        { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 20, 20], Resources: {} }));
      dict.set(PDFName.of('AP'), doc.context.obj({ N: stream }));
    }
    source.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(dict)]));
    const bytes = await doc.save();
    const annotation = (await readNativePdfAnnotations(bytes)).annotations[0];
    useAnnotationStore.getState().setAnnotations([annotation]);
    useAnnotationStore.getState().setSelection([annotation.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    const models = useAnnotationStore.getState().annotations;
    const edited = models.map((item) => item.pageNumber === 2 ? { ...item, data: { ...item.data, text: 'new note' } } : item);
    if (hasAppearance) {
      await expect(writeNativePdfAnnotations(bytes, edited)).rejects.toThrow(/appearance|safely/i);
      return;
    }
    const saved = await writeNativePdfAnnotations(bytes, edited);
    const output = await PDFDocument.load(saved.bytes);
    const original = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const copy = output.getPage(1).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    expect(original.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('old note');
    expect(copy.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('new note');
    expect(copy.get(PDFName.of('AP'))).toBeUndefined();
    expect((await readNativePdfAnnotations(saved.bytes)).annotations.find((item) => item.pageNumber === 2)?.data.text).toBe('new note');
  });
});
