import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degrees, decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { SquigglyNode } from '@/components/annotations/SquigglyNode';
import { initializeMarkupDraft, rotateMarkupQuarterTurn } from '@/core/annotations/geometryTransform';
import type { PdfAnnotation } from '@/core/annotations/types';
import { createMarkupSpace, pdfPointToView } from './markupGeometry';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { readNativePdfAnnotations } from './nativeAnnotationReader';

async function assertParity(pageRotation: number, turns: number, scale: number, fractionalOrigin = false) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]); page.setCropBox(20, 30, 360, 450); page.setRotation(degrees(pageRotation));
  let model: PdfAnnotation = initializeMarkupDraft({ id: 'synthetic-squiggly', type: 'squiggly', pageNumber: 1,
    rect: fractionalOrigin ? { x: 123.456, y: 90.123, width: 92, height: 20 }
      : { x: 60, y: 90, width: 93, height: 20 }, data: { borderColor: '#ef4444', borderWidth: 1.5, opacity: 0.4 },
    createdAt: 1, updatedAt: 1 }, pageRotation);
  for (let i = 0; i < turns; i++) {
    const patch = rotateMarkupQuarterTurn(model);
    if (!patch) throw new Error('Synthetic rotation failed');
    model = { ...model, ...patch };
  }
  const saved = await writeNativePdfAnnotations(await doc.save(), [model]);
  const reopened = (await readNativePdfAnnotations(saved.bytes)).annotations[0];
  const out = await PDFDocument.load(saved.bytes);
  const outPage = out.getPage(0);
  const root = outPage.node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
  const nativeRect = root.lookup(PDFName.of('Rect'), PDFArray).asArray().map((v) => Number(v.toString()));
  const stream = root.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
  if (!(stream instanceof PDFRawStream)) throw new Error('Missing synthetic appearance stream');
  const content = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  const native = Array.from(content.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) [ml]/g), (m) => [Number(m[1]), Number(m[2])]);
  const space = createMarkupSpace(outPage.getCropBox(), outPage.getRotation().angle);
  const nativePoints = native.map(([x, y]) => pdfPointToView(x + nativeRect[0], y + nativeRect[1], space));
  for (const item of [model, reopened]) {
    const rect = { x: item.rect.x * scale, y: item.rect.y * scale, width: item.rect.width * scale, height: item.rect.height * scale };
    const view = render(<SquigglyNode annotation={{ ...item, type: 'squiggly' }} rect={rect} scale={scale} isSelected={false}
      pageRotation={pageRotation} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const path = view.container.querySelector('svg path')!;
    const points = Array.from((path.getAttribute('d') ?? '').matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g), (m) => [Number(m[1]), Number(m[2])]);
    const match = /translate\(([^ ]+) ([^)]+)\)(?: rotate\((\d+)\))?/.exec(path.getAttribute('transform') ?? '');
    expect(match).not.toBeNull();
    const [, tx, ty, rawAngle] = match!; const angle = Number(rawAngle ?? 0) * Math.PI / 180;
    expect(points).toHaveLength(nativePoints.length);
    points.forEach(([x, y], i) => {
      const renderedX = Number(tx) + Math.cos(angle) * x - Math.sin(angle) * y;
      const renderedY = Number(ty) + Math.sin(angle) * x + Math.cos(angle) * y;
      expect(renderedX).toBeCloseTo((nativePoints[i].x - item.rect.x) * scale, 3);
      expect(renderedY).toBeCloseTo((nativePoints[i].y - item.rect.y) * scale, 3);
    });
    expect(Number(path.getAttribute('stroke-width'))).toBeCloseTo(1.5 * scale);
    expect(Number(path.getAttribute('opacity'))).toBeCloseTo(0.4);
    expect(path.getAttribute('stroke-linecap')).toBe('round');
    view.unmount();
  }
}

describe('generated squiggle preview and PDF geometry parity', () => {
  it.each([0, 90, 180, 270])('matches native appearance coordinates for page rotation %s', async (rotation) => {
    for (const turns of [0, 1, 2, 3]) for (const scale of [1, 2]) await assertParity(rotation, turns, scale);
  });
  it.each([0, 90, 180, 270])('keeps segment counts stable at fractional origins on page rotation %s', async (rotation) => {
    await assertParity(rotation, 0, 1, true);
    await assertParity(rotation, 1, 2, true);
  });
});
