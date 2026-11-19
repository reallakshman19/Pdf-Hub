import { describe, expect, it } from 'vitest';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { remapAfterRotate } from '@/core/annotations/pageRemapper';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(rotation: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  page.setCropBox(20, 30, 240, 300);
  page.setRotation(degrees(rotation));
  const appearance = doc.context.register(doc.context.flateStream('q 0 0 1 rg 0 0 60 30 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 60, 30], Resources: {},
  }));
  const roots = [
    { Subtype: 'Stamp', NM: PDFString.of('stamp'), Rect: [50, 70, 110, 100], AP: { N: appearance } },
    { Subtype: 'FreeText', IT: 'FreeTextCallout', NM: PDFString.of('callout'), Rect: [30, 130, 150, 200], RD: [35, 10, 10, 10], CL: [30, 160, 65, 160], Contents: PDFString.of('test') },
    { Subtype: 'Line', NM: PDFString.of('line'), Rect: [75, 220, 160, 260], L: [80, 225, 155, 255] },
    { Subtype: 'Ink', NM: PDFString.of('ink'), Rect: [120, 100, 160, 120], InkList: [[125, 105, 145, 115, 155, 110]] },
    { Subtype: 'Highlight', NM: PDFString.of('highlight'), Rect: [65, 275, 135, 290], QuadPoints: [65, 290, 135, 290, 65, 275, 135, 275] },
  ].map((root) => doc.context.register(doc.context.obj({ Type: 'Annot', P: page.ref, ...root })));
  page.node.set(PDFName.of('Annots'), doc.context.obj(roots));
  return doc.save();
}

async function nativeFields(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
  const fields = new Map<string, Record<string, string>>();
  for (let i = 0; i < annots.size(); i += 1) {
    const dict = annots.lookup(i, PDFDict);
    const name = dict.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText();
    if (!name) continue;
    const values: Record<string, string> = {};
    for (const key of ['Rect', 'CL', 'L', 'InkList', 'QuadPoints']) {
      const value = dict.lookupMaybe(PDFName.of(key), PDFArray);
      if (value) values[key] = value.toString();
    }
    fields.set(name, values);
  }
  return fields;
}

describe('native annotations on a rotated, cropped page', () => {
  for (const initialRotation of [0, 90, 180, 270]) {
    it(`retains native geometry after a further quarter turn from ${initialRotation} degrees`, async () => {
      const input = await fixture(initialRotation);
      const loaded = (await readNativePdfAnnotations(input)).annotations;
      const width = initialRotation % 180 === 0 ? 240 : 300;
      const height = initialRotation % 180 === 0 ? 300 : 240;
      const remapped = remapAfterRotate(loaded, [{ pageIndex: 0, angle: 90, width, height }]);
      const doc = await PDFDocument.load(input);
      doc.getPage(0).setRotation(degrees((initialRotation + 90) % 360));
      const output = await writeNativePdfAnnotations(await doc.save(), remapped);
      const before = await nativeFields(input);
      const after = await nativeFields(output.bytes);
      for (const name of ['stamp', 'callout', 'line', 'ink', 'highlight']) {
        expect(after.get(name), name).toEqual(before.get(name));
      }
      const reopened = (await readNativePdfAnnotations(output.bytes)).annotations;
      for (const original of remapped) {
        const actual = reopened.find((item) => item.id === original.id);
        expect(actual?.rect, original.id).toEqual(original.rect);
      }
    });
  }
});
