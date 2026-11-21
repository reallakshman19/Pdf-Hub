import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { useAnnotationStore } from '../annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const k = lib.PDFName.of;
const array = (d: lib.PDFDict, name: string) => { const a = d.lookup(k(name), lib.PDFArray); return Array.from({ length: a.size() }, (_, i) => a.lookup(i, lib.PDFNumber).asNumber()); };
// Expected screen-space inset order, derived independently of app transforms.
function viewInsets([l,t,r,b]: number[], angle: number) {
  return angle === 0 ? [l,t,r,b] : angle === 90 ? [b,l,t,r] : angle === 180 ? [r,b,l,t] : [t,r,b,l];
}
const pairs = [0,90,180,270].flatMap((from) => [0,90,180,270].map((to) => [from,to]));
describe('synthetic cloud /RD copy regression', () => {
  it.each(pairs)('preserves displayed inner rectangle from page %i to %i', async (from, to) => {
    const doc = await lib.PDFDocument.create();
    const a = doc.addPage([550,550]); a.setCropBox(20,30,300,400); a.setRotation(lib.degrees(from));
    const b = doc.addPage([650,650]); b.setCropBox(40,50,400,300); b.setRotation(lib.degrees(to));
    const stream = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 15 12 re f Q',
      { Type:'XObject', Subtype:'Form', BBox:[0,0,100,60], Resources:{} }));
    const root = doc.context.obj({ Type:'Annot', Subtype:'Square', Rect:[80,130,180,190], RD:[3,7,11,13],
      BE:{S:k('C'),I:1}, NM:lib.PDFString.of('synthetic-cloud'), P:a.ref, AP:{N:stream} });
    a.node.set(k('Annots'), doc.context.obj([doc.context.register(root)]));
    const input = await doc.save(); const model = (await readNativePdfAnnotations(input)).annotations[0];
    expect(model.type).toBe('shape-cloud');
    useAnnotationStore.getState().setAnnotations([model]); useAnnotationStore.getState().setSelection([model.id]);
    useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const result = await writeNativePdfAnnotations(input,useAnnotationStore.getState().annotations);
    const saved = await lib.PDFDocument.load(result.bytes);
    const source = saved.getPage(0).node.lookup(k('Annots'),lib.PDFArray).lookup(0,lib.PDFDict);
    const copy = saved.getPage(1).node.lookup(k('Annots'),lib.PDFArray).lookup(0,lib.PDFDict);
    expect(array(source,'RD')).toEqual([3,7,11,13]);
    expect(copy.lookup(k('BE'),lib.PDFDict).lookup(k('S'),lib.PDFName).decodeText()).toBe('C');
    expect(viewInsets(array(copy,'RD'),to)).toEqual(viewInsets(array(source,'RD'),from));
    expect(copy.lookup(k('AP'),lib.PDFDict).get(k('N'))).toBeDefined();
  });
  it.each([[[3, -1, 11, 13]], [[50, 7, 60, 13]], [[3, 7, 11]]])('rejects invalid native inset %j instead of corrupting the copy', async (rd) => {
    const doc = await lib.PDFDocument.create();
    const source = doc.addPage([300, 400]);
    doc.addPage([300, 400]).setRotation(lib.degrees(90));
    const ap = doc.context.register(doc.context.flateStream('q 0 0 20 20 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
    }));
    const root = doc.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [80, 130, 180, 190], RD: rd,
      BE: { S: k('C'), I: 1 }, NM: lib.PDFString.of('invalid-cloud'), P: source.ref, AP: { N: ap } });
    source.node.set(k('Annots'), doc.context.obj([doc.context.register(root)]));
    const input = await doc.save();
    const model = (await readNativePdfAnnotations(input)).annotations[0];
    useAnnotationStore.getState().setAnnotations([model]);
    useAnnotationStore.getState().setSelection([model.id]);
    useAnnotationStore.getState().copySelection();
    useAnnotationStore.getState().pasteClipboard(2);
    await expect(writeNativePdfAnnotations(input, useAnnotationStore.getState().annotations)).rejects.toThrow(/rectangle differences/);
  });
});

