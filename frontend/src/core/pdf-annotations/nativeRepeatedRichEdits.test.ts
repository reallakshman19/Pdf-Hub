import { describe, expect, it } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(richText = '<body xmlns="http://www.w3.org/1999/xhtml"><p>Initial</p></body>') {
  const doc = await pdfLib.PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 RG 2 w 0 0 200 80 re S BT /F1 12 Tf 10 40 Td (Initial) Tj ET Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 80], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'FreeText', Rect: [50, 100, 250, 180], P: page.ref,
    NM: pdfLib.PDFString.of('rich'), Contents: pdfLib.PDFString.of('Initial'), CA: 0.5,
    RC: pdfLib.PDFHexString.fromText(richText),
    DA: pdfLib.PDFString.of('/Helv 12 Tf 0 0 0 rg'), AP: { N: appearance },
  }));
  page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([root]));
  return doc.save();
}

async function edit(bytes: Uint8Array, text: string, fontSize?: number) {
  const annotations = (await readNativePdfAnnotations(bytes)).annotations;
  const original = annotations[0];
  annotations[0] = { ...original, data: { ...original.data, text, ...(fontSize !== undefined ? { fontSize } : {}),
    nativeInterop: { fidelityClass: 'MUTATED_USER_EDIT', reason: 'USER_EDITED', richText: true } } };
  return (await writeNativePdfAnnotations(bytes, annotations)).bytes;
}

function root(doc: pdfLib.PDFDocument) {
  return doc.getPage(0).node.lookup(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray).lookup(0, pdfLib.PDFDict);
}

describe('repeated native rich-text editing', () => {
  it('reuses one original graphics underlay across twelve edits and retains native opacity', async () => {
    let bytes: Uint8Array = await fixture();
    for (let i = 0; i < 12; i += 1) {
      bytes = await edit(bytes, i % 2 ? `Revision ${i}\nSecond line` : `Revision ${i}`);
      const doc = await pdfLib.PDFDocument.load(bytes);
      const annotation = root(doc);
      expect(annotation.lookup(pdfLib.PDFName.of('CA'), pdfLib.PDFNumber).asNumber()).toBe(0.5);
      const normal = annotation.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
      expect(normal.dict.get(pdfLib.PDFName.of('PDFHubTextUnderlay'))).toBeDefined();
      const graphics = normal.dict.lookup(pdfLib.PDFName.of('Resources'), pdfLib.PDFDict)
        .lookup(pdfLib.PDFName.of('XObject'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('OriginalGraphics'), pdfLib.PDFStream);
      const childResources = graphics.dict.lookupMaybe(pdfLib.PDFName.of('Resources'), pdfLib.PDFDict);
      expect(childResources?.lookupMaybe(pdfLib.PDFName.of('XObject'), pdfLib.PDFDict)?.get(pdfLib.PDFName.of('OriginalGraphics'))).toBeUndefined();
    }
  });

  it('rejects changed appearance commands even when an old cache marker remains', async () => {
    const first = await edit(await fixture(), 'First edit');
    const doc = await pdfLib.PDFDocument.load(first);
    const ap = root(doc).lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    const original = ap.lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    if (!(original instanceof pdfLib.PDFRawStream)) throw new Error('Expected a raw appearance stream');
    const decoded = new TextDecoder().decode(pdfLib.decodePDFRawStream(original).decode());
    const tampered = doc.context.flateStream(`${decoded}\n/Unknown Do\n`, {});
    for (const key of original.dict.keys()) {
      if (['Length', 'Filter', 'DecodeParms'].includes(key.decodeText())) continue;
      const value = original.dict.get(key);
      if (value) tampered.dict.set(key, value);
    }
    ap.set(pdfLib.PDFName.of('N'), doc.context.register(tampered));
    await expect(edit(await doc.save(), 'Second edit')).rejects.toThrow(/nested graphics require a fuller parser/);
  });

  it.each([0, -1, Infinity, NaN])('rejects an invalid font size %s rather than producing invisible text', async (size) => {
    const doc = await pdfLib.PDFDocument.create();
    doc.addPage([300, 300]);
    await expect(writeNativePdfAnnotations(await doc.save(), [{
      id: 'new-text', type: 'textbox', pageNumber: 1,
      rect: { x: 20, y: 20, width: 180, height: 60 },
      data: { text: 'Changed', fontSize: size }, createdAt: 1, updatedAt: 1,
    }])).rejects.toThrow(/unsupported font size/);
  });

  it.each([
    ['BBox', [0, 0, 180, 80]],
    ['Matrix', [1, 0, 0, 1, 7, 0]],
  ] as const)('retains externally changed %s instead of using stale cached geometry', async (key, values) => {
    const first = await edit(await fixture(), 'First edit');
    const doc = await pdfLib.PDFDocument.load(first);
    const normal = root(doc).lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    normal.dict.set(pdfLib.PDFName.of(key), doc.context.obj([...values]));
    const second = await pdfLib.PDFDocument.load(await edit(await doc.save(), 'Second edit'));
    const saved = root(second).lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    const graphics = saved.dict.lookup(pdfLib.PDFName.of('Resources'), pdfLib.PDFDict)
      .lookup(pdfLib.PDFName.of('XObject'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('OriginalGraphics'), pdfLib.PDFStream);
    expect(graphics.dict.lookup(pdfLib.PDFName.of(key), pdfLib.PDFArray).asArray().map((item) => Number(item.toString()))).toEqual([...values]);
  });

  it('renders adjacent inline spans on the same line', async () => {
    const input = await fixture('<body xmlns="http://www.w3.org/1999/xhtml"><span>Ini</span><span>tial</span></body>');
    const doc = await pdfLib.PDFDocument.load(await edit(input, 'Initial!'));
    const normal = root(doc).lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    if (!(normal instanceof pdfLib.PDFRawStream)) throw new Error('Expected a raw appearance stream');
    const commands = new TextDecoder().decode(pdfLib.decodePDFRawStream(normal).decode());
    const positions = [...commands.matchAll(/1 0 0 1 [-\d.]+ ([-\d.]+) Tm/g)].map((match) => Number(match[1]));
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeCloseTo(positions[1]);
  });

  it('keeps descenders inside the clip when tightly fitting several lines', async () => {
    const input = await fixture('<body xmlns="http://www.w3.org/1999/xhtml"><p style="font-family:Times">Initial</p></body>');
    const doc = await pdfLib.PDFDocument.load(await edit(input, Array(8).fill('gyp').join('\n')));
    const normal = root(doc).lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict).lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    if (!(normal instanceof pdfLib.PDFRawStream)) throw new Error('Expected a raw appearance stream');
    const commands = new TextDecoder().decode(pdfLib.decodePDFRawStream(normal).decode());
    const positions = [...commands.matchAll(/1 0 0 1 [-\d.]+ ([-\d.]+) Tm/g)].map((match) => Number(match[1]));
    const sizes = [...commands.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map((match) => Number(match[1]));
    const font = await doc.embedFont(pdfLib.StandardFonts.TimesRoman);
    const lastSize = sizes[sizes.length - 1];
    const descent = font.heightAtSize(lastSize, { descender: true }) - font.heightAtSize(lastSize, { descender: false });
    expect(positions).toHaveLength(8);
    expect(positions[positions.length - 1] - descent).toBeGreaterThanOrEqual(2 - 1e-4);
  });
});
