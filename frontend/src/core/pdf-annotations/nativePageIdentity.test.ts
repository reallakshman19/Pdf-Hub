import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { useAnnotationStore } from '@/core/annotations/store';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function fixture(samePage = false) {
  const doc = await PDFDocument.create();
  const first = doc.addPage([300, 400]);
  const second = doc.addPage([300, 400]);
  for (const page of [first, samePage ? first : second]) {
    const appearance = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 80 30 re f Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {},
    }));
    const root = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Stamp', Rect: [20, 30, 100, 60],
      NM: PDFString.of('shared-name'), P: page.ref, AP: { N: appearance },
    }));
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray) ?? doc.context.obj([]);
    annots.push(root);
    page.node.set(PDFName.of('Annots'), annots);
  }
  return doc.save();
}

describe('native annotation page-scoped identity', () => {
  it('selects and edits only one of two page-local names and keeps both native names', async () => {
    const bytes = await fixture();
    const loaded = await readNativePdfAnnotations(bytes);
    expect(loaded.annotations).toHaveLength(2);
    expect(loaded.annotations[0].id).not.toBe(loaded.annotations[1].id);
    expect(loaded.annotations.map((a) => a.data.nativeOriginalName)).toEqual(['shared-name', 'shared-name']);
    useAnnotationStore.getState().setAnnotations(loaded.annotations);
    useAnnotationStore.getState().updateAnnotation(loaded.annotations[0].id, { rect: { ...loaded.annotations[0].rect, x: loaded.annotations[0].rect.x + 10 } });
    const current = useAnnotationStore.getState().annotations;
    expect(current[0].rect.x).toBe(loaded.annotations[0].rect.x + 10);
    expect(current[1].rect.x).toBe(loaded.annotations[1].rect.x);
    const saved = await writeNativePdfAnnotations(bytes, current);
    const pdf = await PDFDocument.load(saved.bytes);
    for (const page of pdf.getPages()) {
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      expect(annots.size()).toBe(1);
      expect(annots.lookup(0, PDFDict).lookup(PDFName.of('NM'), PDFString).decodeText()).toBe('shared-name');
    }
  });

  it('fails closed when two roots have the same native name on one page', async () => {
    const bytes = await fixture(true);
    const loaded = await readNativePdfAnnotations(bytes);
    await expect(writeNativePdfAnnotations(bytes, loaded.annotations)).rejects.toThrow(/duplicate native name on the same page/);
  });
});
