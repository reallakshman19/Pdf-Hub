import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString } from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 80 30 re f 0 0 1 rg 0 20 15 10 re f Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
  }));
  const root = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Stamp', Rect: [20, 30, 100, 60],
    NM: PDFString.of('rotating-stamp'), P: page.ref, AP: { N: appearance },
  }));
  page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
  return doc.save();
}

async function root(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
}

function array(dict: PDFDict, key: string) {
  return dict.lookup(PDFName.of(key), PDFArray).asArray().map((value) => Number(value.toString()));
}

describe('native stamp rotation', () => {
  it('creates a legible native text stamp with its requested case and colors', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const annotation = { id: 'label', type: 'stamp' as const, pageNumber: 1, rect: { x: 20, y: 40, width: 150, height: 36 },
      data: { text: 'Mixed Case', borderColor: '#ff0000', backgroundColor: '#00ff00', textColor: '#0000ff' }, createdAt: 1, updatedAt: 1 };
    const output = await writeNativePdfAnnotations(await doc.save(), [annotation]);
    const stream = (await root(output.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const content = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    expect(content).toContain('0 1 0 rg');
    expect(content).toContain('0 0 1 rg');
    expect(content.toLowerCase()).toContain('<4d697865642043617365> tj');
    expect((await readNativePdfAnnotations(output.bytes)).annotations[0].data.text).toBe('Mixed Case');
  });

  it('rejects unsupported stamp characters instead of writing corrupt text', async () => {
    const doc = await PDFDocument.create(); doc.addPage([300, 400]);
    const annotation = { id: 'unsupported', type: 'stamp' as const, pageNumber: 1, rect: { x: 20, y: 40, width: 150, height: 36 }, data: { text: 'CHECK ✓' }, createdAt: 1, updatedAt: 1 };
    await expect(writeNativePdfAnnotations(await doc.save(), [annotation])).rejects.toThrow('unsupported characters');
  });

  it('does not silently replace an imported custom stamp when its style changes', async () => {
    const input = await fixture();
    const stamp = (await readNativePdfAnnotations(input)).annotations[0];
    await expect(writeNativePdfAnnotations(input, [{ ...stamp, data: { ...stamp.data, borderColor: '#ff0000' } }]))
      .rejects.toThrow('Cannot safely replace an imported custom stamp appearance');
  });

  it('rebuilds the appearance for a stamp created by this application after a style edit', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const annotation = { id: 'created', type: 'stamp' as const, pageNumber: 1, rect: { x: 20, y: 40, width: 80, height: 30 }, data: { text: 'APPROVED', borderColor: '#0000ff' }, createdAt: 1, updatedAt: 1 };
    const first = await writeNativePdfAnnotations(await doc.save(), [annotation]);
    const reopened = (await readNativePdfAnnotations(first.bytes)).annotations[0];
    expect(reopened.data.nativeStampAppearanceKind).toBe('generated');
    const changed = { ...reopened, data: { ...reopened.data, text: 'REVIEWED', borderColor: '#ff0000' } };
    const second = await writeNativePdfAnnotations(first.bytes, [changed]);
    expect((await readNativePdfAnnotations(second.bytes)).annotations[0].data.text).toBe('REVIEWED');
    const oldAp = (await root(first.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    const newAp = (await root(second.bytes)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    expect(Array.from(newAp)).not.toEqual(Array.from(oldAp));
  });

  it('rotates the native appearance, survives reopen and repeated save, and restores at zero degrees', async () => {
    const input = await fixture();
    const original = (await readNativePdfAnnotations(input)).annotations[0];
    const ninety = { ...original, data: { ...original.data, rotation: 90 } };
    const saved = await writeNativePdfAnnotations(input, [ninety]);
    const rotated = await root(saved.bytes);
    const rect = array(rotated, 'Rect');
    expect(rect[0]).toBeCloseTo(45); expect(rect[1]).toBeCloseTo(5);
    expect(rect[2]).toBeCloseTo(75); expect(rect[3]).toBeCloseTo(85);
    const ap = rotated.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream);
    expect(array(ap.dict, 'Matrix').slice(0, 4)).toEqual([0, -1, 1, 0]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.data.rotation).toBe(90);
    expect(reopened.rect).toEqual(original.rect);
    const again = await writeNativePdfAnnotations(saved.bytes, [reopened]);
    expect(array(await root(again.bytes), 'Rect')).toEqual(rect);
    const moved = await writeNativePdfAnnotations(saved.bytes, [{ ...reopened, rect: { ...reopened.rect, x: reopened.rect.x + 25, y: reopened.rect.y + 10 } }]);
    const movedRoot = await root(moved.bytes);
    expect(array(movedRoot, 'Rect').map((n) => Math.round(n))).toEqual([70, -5, 100, 75]);
    const movedStream = movedRoot.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    expect(Array.from(movedStream)).toEqual(Array.from(ap.getContents()));
    const restore = await writeNativePdfAnnotations(again.bytes, [{ ...reopened, data: { ...reopened.data, rotation: 0 } }]);
    const restored = await root(restore.bytes);
    expect(array(restored, 'Rect')).toEqual([20, 30, 100, 60]);
    const originalStream = (await root(input)).lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    const restoredStream = restored.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream).getContents();
    expect(Array.from(restoredStream)).toEqual(Array.from(originalStream));
    const evidenceDir = process.env.WP01_SYNTHETIC_EVIDENCE_DIR;
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await Promise.all([
        writeFile(join(evidenceDir, 'stamp-original.pdf'), input),
        writeFile(join(evidenceDir, 'stamp-rotated.pdf'), saved.bytes),
        writeFile(join(evidenceDir, 'stamp-rotated-resaved.pdf'), again.bytes),
        writeFile(join(evidenceDir, 'stamp-restored.pdf'), restore.bytes),
      ]);
    }
  });
});
