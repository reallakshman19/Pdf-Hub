import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { initializeMarkupDraft, rotateMarkupQuarterTurn } from '@/core/annotations/geometryTransform';
import { remapAfterRotate } from '@/core/annotations/pageRemapper';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { UnderlineNode } from '@/components/annotations/UnderlineNode';
import { StrikeoutNode } from '@/components/annotations/StrikeoutNode';
import { SquigglyNode } from '@/components/annotations/SquigglyNode';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

const nodes = { underline: UnderlineNode, strikeout: StrikeoutNode, squiggly: SquigglyNode };
type Mark = keyof typeof nodes;

function assertVertical(model: PdfAnnotation, rotation: number) {
  const Node = nodes[model.type as Mark];
  const result = render(<Node annotation={model as never} rect={model.rect} scale={1} isSelected={false}
    pageRotation={rotation} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
  if (model.type === 'squiggly') {
    expect(result.container.querySelector('svg path')?.getAttribute('transform')).toContain('rotate(90)');
  } else {
    const line = result.container.querySelector('svg line')!;
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(Number(line.getAttribute('x2')));
    expect(Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))).toBeCloseTo(8);
  }
  result.unmount();
}

async function make(type: Mark, rotation: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]); page.setCropBox(20, 30, 360, 450); page.setRotation(degrees(rotation));
  const draft = initializeMarkupDraft({ id: 'narrow', type, pageNumber: 1, rect: { x: 60, y: 90, width: 8, height: 20 },
    data: { borderColor: '#123456' }, createdAt: 1, updatedAt: 1 }, rotation);
  const patch = rotateMarkupQuarterTurn(draft);
  if (!patch) throw new Error('Synthetic rotation failed');
  return { bytes: await doc.save(), annotation: { ...draft, ...patch } };
}

describe('narrow generated markup preview provenance', () => {
  it.each(['underline', 'strikeout', 'squiggly'] as const)('renders %s vertically before and after save on every page rotation', async (type) => {
    for (const rotation of [0, 90, 180, 270]) {
      const { bytes, annotation } = await make(type, rotation);
      assertVertical(annotation, rotation);
      const saved = await writeNativePdfAnnotations(bytes, [annotation]);
      const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
      expect(reopened.data.nativeMarkupGeneratedAppearance).toBe(true);
      assertVertical(reopened, rotation);
    }
  });

  it('keeps the generated orientation after a page turn before the first save', async () => {
    const { bytes, annotation } = await make('underline', 0);
    const turnedPage = remapAfterRotate([annotation], [{ pageIndex: 0, angle: 90, width: 360, height: 450 }])[0];
    const doc = await PDFDocument.load(bytes); doc.getPage(0).setRotation(degrees(90));
    const saved = await writeNativePdfAnnotations(await doc.save(), [turnedPage]);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
    expect(reopened.data.nativeMarkupGeneratedAppearance).toBe(true);
    expect(reopened.rect.width).toBeCloseTo(8); expect(reopened.rect.height).toBeCloseTo(20);
  });

  it.each([false, true])('keeps narrow orientation across copy with first save before copy = %s', async (saveFirst) => {
    const { bytes, annotation } = await make('underline', 0);
    const doc = await PDFDocument.load(bytes); const page = doc.addPage([400, 500]); page.setRotation(degrees(90));
    let working = await doc.save();
    let source = annotation;
    if (saveFirst) {
      working = (await writeNativePdfAnnotations(working, [source])).bytes;
      source = (await readNativePdfAnnotations(working)).annotations[0];
    }
    useSessionStore.setState({ documentKey: 'narrow-synthetic', pageGraph: { pages: [0, 90].map((rotation, index) => ({
      pageId: `narrow-${index}`, documentKey: 'narrow-synthetic', originalPageNumber: index + 1,
      currentIndex: index, width: 400, height: 500, rotation: rotation as 0 | 90,
    })) } });
    useAnnotationStore.getState().setAnnotations([source]);
    useAnnotationStore.getState().setSelection([source.id]);
    useAnnotationStore.getState().copySelection(); useAnnotationStore.getState().pasteClipboard(2);
    const copy = useAnnotationStore.getState().annotations[1];
    expect(copy).toBeDefined(); assertVertical(copy, 90);
    const saved = await writeNativePdfAnnotations(working, useAnnotationStore.getState().annotations);
    const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations.find((item) => item.pageNumber === 2)!;
    expect(reopened.data.nativeMarkupGeneratedAppearance).toBe(true);
    assertVertical(reopened, 90);
    useSessionStore.getState().clearDocument();
  });

  it.each(['removed-fingerprint', 'changed-appearance'] as const)('does not trust %s, including a forged PDFHubData flag', async (kind) => {
    const { bytes, annotation } = await make('underline', 0);
    const saved = await writeNativePdfAnnotations(bytes, [annotation]);
    const doc = await PDFDocument.load(saved.bytes);
    const root = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    root.set(PDFName.of('PDFHubData'), PDFString.of(JSON.stringify({ nativeMarkupGeneratedAppearance: true })));
    if (kind === 'removed-fingerprint') root.delete(PDFName.of('PDFHubGeneratedMarkupAPFingerprint'));
    else {
      const form = doc.context.register(doc.context.flateStream('q 1 0 0 rg 0 0 2 2 re f Q',
        { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 20, 8], Resources: {} }));
      root.set(PDFName.of('AP'), doc.context.obj({ N: form }));
    }
    const imported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    expect(imported.data.nativeMarkupGeneratedAppearance).toBeUndefined();
  });
});
