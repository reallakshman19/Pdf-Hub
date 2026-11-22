import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const ap = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 30 20 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 30, 20], Resources: {},
  }));
  const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [100, 100, 150, 140], P: page.ref });
  const popupRef = doc.context.register(popup);
  const stamp = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', NM: PDFString.of('named'), Rect: [20, 30, 50, 50], P: page.ref, Popup: popupRef, AP: { N: ap } }));
  popup.set(PDFName.of('Parent'), stamp);
  const unnamed = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [70, 30, 100, 50], P: page.ref, AP: { N: ap } }));
  const link = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [110, 30, 150, 50], P: page.ref }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([stamp, popupRef, unnamed, link]));
  return doc.save();
}

async function types(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const array = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
  return Array.from({ length: array.size() }, (_, index) => array.lookup(index, PDFDict).get(PDFName.of('Subtype'))?.toString()).sort();
}

describe('managed native annotation deletion', () => {
  it('removes an explicitly deleted stamp and its popup while preserving a different and an unsupported annotation', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const output = await writeNativePdfAnnotations(bytes, loaded.filter((a) => a.id !== 'named'), { replaceManagedAnnotations: true });
    expect(await types(output.bytes)).toEqual(['/Link', '/Stamp']);
    expect((await readNativePdfAnnotations(output.bytes)).annotations).toHaveLength(1);
  });

  it('handles deletion of the last managed annotation without removing unsupported objects', async () => {
    const bytes = await fixture();
    const output = await writeNativePdfAnnotations(bytes, [], { replaceManagedAnnotations: true });
    expect(await types(output.bytes)).toEqual(['/Link']);
  });

  it('edits an unnamed native stamp without leaving a second original behind', async () => {
    const bytes = await fixture();
    const loaded = (await readNativePdfAnnotations(bytes)).annotations;
    const unnamed = loaded.find((a) => a.id !== 'named')!;
    unnamed.rect = { ...unnamed.rect, x: unnamed.rect.x + 10 };
    const output = await writeNativePdfAnnotations(bytes, loaded, { replaceManagedAnnotations: true });
    expect(await types(output.bytes)).toEqual(['/Link', '/Popup', '/Stamp', '/Stamp']);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations;
    expect(reopened.find((a) => a.id === unnamed.id)?.rect.x).toBe(unnamed.rect.x);
  });
});
