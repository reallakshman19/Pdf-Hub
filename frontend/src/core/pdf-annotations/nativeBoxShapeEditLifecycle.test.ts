import { describe, expect, it } from 'vitest';
import * as lib from 'pdf-lib';
import { rotateBoxShapeQuarterTurn } from '@/core/annotations/geometryTransform';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { BOX_GENERATED_AP_ORIENTATION_KEY } from './nativeBoxShapeProvenance';

const key = lib.PDFName.of;
async function create(type: 'shape-rect' | 'shape-ellipse' = 'shape-rect') {
  const doc = await lib.PDFDocument.create(); doc.addPage([300, 400]);
  const page2 = doc.addPage([300, 400]); page2.setRotation(lib.degrees(90));
  const item: PdfAnnotation = { id: 'shape', type, pageNumber: 1, rect: { x: 40, y: 50, width: 100, height: 60 },
    data: { borderColor: '#123456', borderWidth: 2, borderStyle: 'solid', backgroundColor: 'transparent', opacity: 0.8 },
    createdAt: 1, updatedAt: 1 };
  return (await writeNativePdfAnnotations(await doc.save(), [item])).bytes;
}
async function root(bytes: Uint8Array, page = 0) {
  const doc = await lib.PDFDocument.load(bytes);
  return { doc, shape: doc.getPage(page).node.lookup(key('Annots'), lib.PDFArray).lookup(0, lib.PDFDict) };
}
function decoded(shape: lib.PDFDict): Uint8Array {
  const stream = shape.lookup(key('AP'), lib.PDFDict).lookup(key('N'), lib.PDFStream) as lib.PDFRawStream;
  return lib.decodePDFRawStream(stream).decode();
}
function turn(item: PdfAnnotation) { const patch = rotateBoxShapeQuarterTurn(item); if (!patch) throw new Error('Rotation unavailable'); return { ...item, ...patch }; }

describe('generated box appearance edit lifecycle', () => {
  it.each(['shape-rect', 'shape-ellipse'] as const)('reopens and safely regenerates a styled %s appearance', async (type) => {
    const input = await create(type); const source = (await readNativePdfAnnotations(input)).annotations[0];
    expect(source.data.nativeBoxShapeGenerated).toBe(true);
    const edited = { ...source, data: { ...source.data, borderWidth: 5, borderStyle: 'dashed' as const, borderColor: '#ff0000' } };
    const output = await writeNativePdfAnnotations(input, [edited]);
    const before = await root(input); const after = await root(output.bytes);
    expect(decoded(after.shape)).not.toEqual(decoded(before.shape));
    expect(after.shape.lookup(key('Border'), lib.PDFArray).lookup(2, lib.PDFNumber).asNumber()).toBe(5);
    const reopened = (await readNativePdfAnnotations(output.bytes)).annotations[0];
    expect(reopened.data.nativeBoxShapeGenerated).toBe(true); expect(reopened.data.borderColor).toBe('#ff0000');
  });
  it('accepts external BS/Border edits with an unchanged AP, then regenerates only on explicit local styling', async () => {
    const bytes = await create(); const external = await root(bytes);
    external.shape.set(key('Border'), external.doc.context.obj([0, 0, 9]));
    external.shape.set(key('BS'), external.doc.context.obj({ W: 3, S: key('D'), D: [4, 2] }));
    const input = await external.doc.save(); const source = (await readNativePdfAnnotations(input)).annotations[0];
    expect(source.data.nativeBoxShapeGenerated).toBe(true); expect(source.data.borderWidth).toBe(3);
    const noop = await writeNativePdfAnnotations(input, [source]); const saved = await root(noop.bytes);
    expect(decoded(saved.shape)).toEqual(decoded(external.shape));
    expect(saved.shape.lookup(key('BS'), lib.PDFDict).lookup(key('D'), lib.PDFArray).toString()).toBe('[ 4 2 ]');
    const changed = { ...source, data: { ...source.data, borderWidth: 5, borderStyle: 'solid' as const } };
    const output = await writeNativePdfAnnotations(noop.bytes, [changed]); const result = await root(output.bytes);
    expect(result.shape.lookup(key('BS'), lib.PDFDict).lookup(key('W'), lib.PDFNumber).asNumber()).toBe(5);
    expect(decoded(result.shape)).not.toEqual(decoded(external.shape));
  });
  it.each(['content', 'bbox', 'matrix', 'resources'] as const)('preserves externally tampered %s AP and rejects a forged generated edit', async (tamper) => {
    const input = await create(); const external = await root(input);
    const ap = external.shape.lookup(key('AP'), lib.PDFDict);
    const form = ap.lookup(key('N'), lib.PDFStream) as lib.PDFRawStream;
    if (tamper === 'content') ap.set(key('N'), external.doc.context.register(external.doc.context.flateStream('q 1 0 0 rg 0 0 5 5 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 60], Resources: {},
    })));
    if (tamper === 'bbox') form.dict.set(key('BBox'), external.doc.context.obj([0, 0, 101, 60]));
    if (tamper === 'matrix') form.dict.set(key('Matrix'), external.doc.context.obj([1, 0, 0, 1, 2, 0]));
    if (tamper === 'resources') form.dict.set(key('Resources'), external.doc.context.obj({ ExtGState: { GS0: { Type: 'ExtGState', CA: 0.2, ca: 0.2 } } }));
    const changed = await external.doc.save(); const imported = (await readNativePdfAnnotations(changed)).annotations[0];
    expect(imported.data.nativeBoxShapeGenerated).toBeUndefined();
    const noop = await writeNativePdfAnnotations(changed, [imported]);
    expect(decoded((await root(noop.bytes)).shape)).toEqual(decoded(external.shape));
    const forged = { ...imported, data: { ...imported.data, nativeBoxShapeGenerated: true, borderColor: '#ff0000' } };
    await expect(writeNativePdfAnnotations(changed, [forged])).rejects.toThrow('Cannot safely replace this imported annotation appearance');
  });
  it('preserves generated orientation across rotate, style edit, copy and reopen', async () => {
    const bytes = await create(); const original = (await readNativePdfAnnotations(bytes)).annotations[0];
    const once = await writeNativePdfAnnotations(bytes, [turn(original)]);
    const rotated = (await readNativePdfAnnotations(once.bytes)).annotations[0];
    expect(rotated.data.nativeBoxShapeGeneratedOrientation).toBe(1);
    const edited = { ...rotated, data: { ...rotated.data, borderColor: '#ff0000' } };
    const saved = await writeNativePdfAnnotations(once.bytes, [edited]);
    const final = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(final.data.nativeBoxShapeGenerated).toBe(true); expect(final.data.nativeBoxShapeGeneratedOrientation).toBe(1);
    useSessionStore.getState().clearDocument(); useAnnotationStore.getState().setAnnotations([final]);
    useAnnotationStore.getState().setSelection([final.id]); useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const copied = await writeNativePdfAnnotations(saved.bytes, useAnnotationStore.getState().annotations);
    const reopened = (await readNativePdfAnnotations(copied.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expect(reopened.data.nativeBoxShapeGenerated).toBe(true);
    expect(reopened.data.nativeBoxShapeGeneratedOrientation).toBe(0);
    const copyEdited = { ...reopened, data: { ...reopened.data, borderWidth: 4 } };
    await expect(writeNativePdfAnnotations(copied.bytes, [(await readNativePdfAnnotations(copied.bytes)).annotations[0], copyEdited])).resolves.toBeDefined();
    const output = await root(copied.bytes, 1);
    expect(output.shape.lookup(key(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber).asNumber()).toBe(0);
  });
});
