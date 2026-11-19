import { describe, expect, it } from 'vitest';
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(mask: number, appearance: 'none' | 'icon' | 'text') {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const root = doc.context.obj({
    Type: 'Annot', Subtype: 'Text', NM: PDFString.of('note'), Contents: PDFString.of('old text'),
    Rect: [80, 200, 120, 220], P: page.ref, F: 4,
  });
  if (mask & 1) root.set(PDFName.of('Name'), PDFName.of('Comment'));
  if (mask & 2) root.set(PDFName.of('Open'), PDFBool.False);
  if (mask & 4) root.set(PDFName.of('C'), doc.context.obj([0.123, 0.456, 0.789]));
  if (appearance !== 'none') {
    const content = appearance === 'text' ? 'q BT /F1 10 Tf (old text) Tj ET Q' : 'q 1 0 0 rg 0 0 18 20 re f Q';
    const ap = doc.context.register(doc.context.flateStream(content, {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 40, 20], Resources: {},
    }));
    root.set(PDFName.of('AP'), doc.context.obj({ N: ap }));
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(root)]));
  return doc.save();
}

async function root(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}
function decoded(dict: PDFDict) {
  const stream = dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
  if (!(stream instanceof PDFRawStream)) throw new Error('Expected a raw appearance stream');
  return Array.from(decodePDFRawStream(stream).decode());
}
function appearanceFields(dict: PDFDict) {
  return ['Name', 'Open', 'C'].map((key) => dict.get(PDFName.of(key))?.toString());
}

describe('native text-note root appearances', () => {
  it('preserves optional native fields and icon AP on no-op/move and guards edits for all field combinations', async () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const bytes = await fixture(mask, 'icon');
      const before = await root(bytes);
      const input = (await readNativePdfAnnotations(bytes)).annotations[0];
      for (const action of ['noop', 'move'] as const) {
        const item = action === 'move' ? { ...input, rect: { ...input.rect, x: input.rect.x + 10 } } : input;
        const saved = await writeNativePdfAnnotations(bytes, [item]);
        const after = await root(saved.bytes);
        expect(appearanceFields(after), `mask ${mask}, ${action}`).toEqual(appearanceFields(before));
        expect(decoded(after), `mask ${mask}, ${action}`).toEqual(decoded(before));
      }
      const edited = { ...input, data: { ...input.data, text: 'new text' } };
      await expect(writeNativePdfAnnotations(bytes, [edited]), `mask ${mask}`).rejects.toThrow(/appearance|safely/i);
    }
  });

  it('retains opaque text-bearing AP on no-op/move and rejects text editing without destroying source', async () => {
    const bytes = await fixture(0, 'text');
    const input = (await readNativePdfAnnotations(bytes)).annotations[0];
    const before = await root(bytes);
    for (const item of [input, { ...input, rect: { ...input.rect, x: input.rect.x + 10 } }]) {
      const saved = await writeNativePdfAnnotations(bytes, [item]);
      expect(decoded(await root(saved.bytes))).toEqual(decoded(before));
    }
    const changed = { ...input, data: { ...input.data, text: 'new text' } };
    await expect(writeNativePdfAnnotations(bytes, [changed])).rejects.toThrow(/appearance|safely/i);
    expect(decoded(await root(bytes))).toEqual(decoded(before));
  });

  it('allows edits when the imported note has no AP and does not invent one', async () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const bytes = await fixture(mask, 'none');
      const input = (await readNativePdfAnnotations(bytes)).annotations[0];
      const saved = await writeNativePdfAnnotations(bytes, [{ ...input, data: { ...input.data, text: 'new text' } }]);
      const after = await root(saved.bytes);
      expect(after.get(PDFName.of('AP'))).toBeUndefined();
      expect(appearanceFields(after)).toEqual(appearanceFields(await root(bytes)));
      expect(after.lookup(PDFName.of('Contents'), PDFString, PDFHexString).decodeText()).toBe('new text');
    }
  });

  it('preserves the icon AP when opening a note and rejects unsafe recoloring', async () => {
    const bytes = await fixture(0, 'icon');
    const input = (await readNativePdfAnnotations(bytes)).annotations[0];
    const opened = { ...input, data: { ...input.data, isCollapsed: false } };
    const saved = await writeNativePdfAnnotations(bytes, [opened]);
    const after = await root(saved.bytes);
    expect(after.lookup(PDFName.of('Open'), PDFBool).asBoolean()).toBe(true);
    expect(decoded(after)).toEqual(decoded(await root(bytes)));
    const recolored = { ...input, data: { ...input.data, backgroundColor: '#0000ff' } };
    await expect(writeNativePdfAnnotations(bytes, [recolored])).rejects.toThrow(/appearance|safely/i);
  });

  it('guards opaque imported reply AP, while a reply without AP remains editable', async () => {
    for (const withAppearance of [false, true]) {
      const doc = await PDFDocument.load(await fixture(0, 'none'));
      const page = doc.getPage(0);
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      const parentRef = annots.get(0);
      const reply = doc.context.obj({
        Type: 'Annot', Subtype: 'Text', NM: PDFString.of('reply'), Contents: PDFString.of('old reply'),
        Rect: [120, 200, 140, 220], P: page.ref, IRT: parentRef, RT: 'R',
      });
      if (withAppearance) {
        const ap = doc.context.register(doc.context.flateStream('q 0 0 20 20 re f Q', {
          Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 20, 20], Resources: {},
        }));
        reply.set(PDFName.of('AP'), doc.context.obj({ N: ap }));
      }
      annots.push(doc.context.register(reply));
      const bytes = await doc.save();
      const input = (await readNativePdfAnnotations(bytes)).annotations[0];
      const originalReply = input.data.review!.replies[0];
      const changed = { ...input, data: { ...input.data, review: {
        ...input.data.review!, replies: [{ ...originalReply, content: 'new reply' }],
      } } };
      if (withAppearance) {
        await expect(writeNativePdfAnnotations(bytes, [changed])).rejects.toThrow(/appearance|safely/i);
        const saved = await writeNativePdfAnnotations(bytes, [input]);
        const reread = await PDFDocument.load(saved.bytes);
        const result = reread.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
        const item = result.asArray().map((_, i) => result.lookup(i, PDFDict))
          .find((dict) => dict.get(PDFName.of('IRT')))!;
        expect(item.get(PDFName.of('AP'))).toBeDefined();
      } else {
        const saved = await writeNativePdfAnnotations(bytes, [changed]);
        expect((await readNativePdfAnnotations(saved.bytes)).annotations[0].data.review?.replies[0].content).toBe('new reply');
      }
    }
  });
});
