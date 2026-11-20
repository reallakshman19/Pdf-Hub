import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';
import { HighlightNode } from './HighlightNode';
import { UnderlineNode } from './UnderlineNode';
import { StrikeoutNode } from './StrikeoutNode';
import { SquigglyNode } from './SquigglyNode';
import { axisAlignedTextMarkupQuads, orientedTextMarkupQuads, textMarkupPreviewRotation } from './shared/textMarkupQuads';
import { remapAfterRotate } from '@/core/annotations/pageRemapper';
import { rotateMarkupQuarterTurn } from '@/core/annotations/geometryTransform';

// The two quads use Z and perimeter ordering, respectively.
const quads = [0, 0, 0.8, 0, 0, 0.2, 0.8, 0.2,
  0.1, 0.6, 0.7, 0.6, 0.7, 0.8, 0.1, 0.8];

describe('native multi-quad text-markup previews', () => {
  it('only accepts valid, source-bound saved and pending preview turns', () => {
    expect(textMarkupPreviewRotation(90, undefined, undefined, undefined)).toBe(90);
    expect(textMarkupPreviewRotation(270, 'source', 2, { turns: 1, sourceHash: 'source' })).toBe(180);
    expect(textMarkupPreviewRotation(0, undefined, 1, undefined)).toBeUndefined();
    expect(textMarkupPreviewRotation(0, undefined, 0, undefined)).toBeUndefined();
    expect(textMarkupPreviewRotation(0, 'source', 4, undefined)).toBeUndefined();
    expect(textMarkupPreviewRotation(0, 'source', 1.5, undefined)).toBeUndefined();
    expect(textMarkupPreviewRotation(0, 'source', undefined, { turns: 1, sourceHash: 'stale' })).toBeUndefined();
    expect(textMarkupPreviewRotation(0, 'source', undefined, { turns: 0, sourceHash: 'source' })).toBeUndefined();
    expect(textMarkupPreviewRotation(undefined, 'source', 1, undefined)).toBeUndefined();
  });

  it('tracks the page basis and individual turn of a newly created markup', () => {
    expect(textMarkupPreviewRotation(90, undefined, undefined, undefined, { basisRotation: 90, turns: 0 })).toBe(0);
    expect(textMarkupPreviewRotation(180, undefined, undefined, undefined, { basisRotation: 90, turns: 1 })).toBe(180);
    expect(textMarkupPreviewRotation(0, undefined, undefined, undefined, { basisRotation: 45, turns: 1 })).toBeUndefined();
    expect(textMarkupPreviewRotation(0, 'source', undefined, undefined, { basisRotation: 0, turns: 1 })).toBeUndefined();
  });

  it.each([null, false, 0, 'invalid', {}])('rejects malformed draft preview state %s without throwing', (draft) => {
    expect(textMarkupPreviewRotation(0, undefined, undefined, undefined,
      draft as unknown as { basisRotation: number; turns: number })).toBeUndefined();
  });

  it('combines a reopened annotation turn with a further unsaved turn', () => {
    const model: PdfAnnotation = { id: 'synthetic', type: 'underline', pageNumber: 1,
      rect: { x: 20, y: 30, width: 40, height: 100 }, createdAt: 1, updatedAt: 1,
      data: { nativeMarkupRotationSourceHash: 'source', nativeMarkupPreviewOffset: 1,
        textMarkupQuads: [1, 0, 1, 1, 0, 0, 0, 1] } };
    const patch = rotateMarkupQuarterTurn(model);
    expect(patch).not.toBeNull();
    const rotated = { ...model, ...patch };
    const view = render(<UnderlineNode annotation={{ ...rotated, type: 'underline' }} rect={rotated.rect} scale={1} isSelected={false}
      pageRotation={0} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const line = view.container.querySelector('svg line')!;
    ['x1', 'y1', 'x2', 'y2'].forEach((key, index) =>
      expect(Number(line.getAttribute(key))).toBeCloseTo([100, 6.8, 0, 6.8][index]));
  });

  it.each([0, 90, 180, 270])('orients individual line-markup turns and reopened previews on a %s-degree page', (pageRotation) => {
    const base: PdfAnnotation = { id: 'synthetic', type: 'underline', pageNumber: 1,
      rect: { x: 30, y: 10, width: 200, height: 50 },
      data: { nativeMarkupRotationSourceHash: 'source', textMarkupQuads: quads }, createdAt: 1, updatedAt: 1 };
    const pageModel = pageRotation === 0 ? base
      : remapAfterRotate([base], [{ pageIndex: 0, angle: pageRotation, width: 400, height: 500 }])[0];
    const point = (x: number, y: number, angle: number) => angle === 0 ? [x, y]
      : angle === 90 ? [50 - y, x] : angle === 180 ? [200 - x, 50 - y] : [y, 200 - x];
    let rotated = pageModel;
    for (let turns = 1; turns <= 3; turns++) {
      const patch = rotateMarkupQuarterTurn(rotated);
      expect(patch).not.toBeNull();
      rotated = { ...rotated, ...patch };
      const angle = (pageRotation + turns * 90) % 360;
      const variants = [rotated, { ...rotated, data: { ...rotated.data,
        nativeMarkupPreviewOffset: turns, nativeMarkupTurn: undefined } }];
      for (const model of variants) {
        const props = { rect: model.rect, scale: 1, isSelected: false, pageRotation,
          onSelect: vi.fn(), onTransformStart: vi.fn() };
        for (const [kind, fraction] of [['underline', 0.83], ['strikeout', 0.55]] as const) {
          const view = kind === 'underline'
            ? render(<UnderlineNode {...props} annotation={{ ...model, type: 'underline' }} />)
            : render(<StrikeoutNode {...props} annotation={{ ...model, type: 'strikeout' }} />);
          const lines = view.container.querySelectorAll('svg line');
          expect(lines).toHaveLength(2);
          const start = point(0, 10 * fraction, angle); const end = point(160, 10 * fraction, angle);
          ['x1', 'y1', 'x2', 'y2'].forEach((key, index) =>
            expect(Number(lines[0].getAttribute(key))).toBeCloseTo([...start, ...end][index]));
          view.unmount();
        }
        const wave = render(<SquigglyNode {...props} annotation={{ ...model, type: 'squiggly' }} />);
        const paths = wave.container.querySelectorAll('svg path');
        expect(paths).toHaveLength(2);
        const origin = point(0, 0, angle);
        expect(paths[0].getAttribute('transform')).toBe(`translate(${origin[0]} ${origin[1]})${angle ? ` rotate(${angle})` : ''}`);
        const initial = /^M 0 ([\d.]+) /.exec(paths[0].getAttribute('d') ?? '');
        expect(initial).not.toBeNull();
        expect(Number(initial![1])).toBeCloseTo(8.3);
        wave.unmount();
      }
    }
  });
  it('keeps quad preview geometry correct when the user rotates a page', () => {
    const annotation = { id: 'q', type: 'underline', pageNumber: 1, rect: { x: 30, y: 10, width: 200, height: 50 },
      data: { textMarkupQuads: [0, 0, 0.8, 0, 0, 0.2, 0.8, 0.2] }, createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
    const rotated = remapAfterRotate([annotation], [{ pageIndex: 0, angle: 90, width: 400, height: 500 }])[0];
    const view = render(<UnderlineNode annotation={{ ...rotated, type: 'underline' }} rect={rotated.rect}
      scale={1} isSelected={false} pageRotation={90} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const line = view.container.querySelector('line')!;
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(41.7);
    expect(Number(line.getAttribute('y1'))).toBeCloseTo(0);
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(41.7);
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(160);
  });

  it('rejects rotated bottom-edge-first, malformed and undefined orientations', () => {
    const reversed = [0, 0.8, 0, 0, 1, 0.8, 1, 0];
    expect(orientedTextMarkupQuads(reversed, 10, 160, 90)).toBeNull();
    expect(orientedTextMarkupQuads([0, 0, 1, 0, 0, 1, NaN, 1], 200, 100, 0)).toBeNull();
    expect(orientedTextMarkupQuads(quads, 200, 100, undefined)).toBeNull();
    expect(orientedTextMarkupQuads(quads, 200, 100, 45)).toBeNull();
    expect(orientedTextMarkupQuads([0, 1, 1, 1, 0, 0, 1, 0], 1e9, 20, 0)).toBeNull();
    expect(orientedTextMarkupQuads([0, 0, 0, 1, 1, 0, 1, 1], 20, 1e9, 90)).toBeNull();
  });
  it.each([
    [0, [0, 8.3, 160, 8.3], [20, 38.3, 140, 38.3]],
    [90, [41.7, 0, 41.7, 160], [11.7, 20, 11.7, 140]],
    [180, [200, 41.7, 40, 41.7], [180, 11.7, 60, 11.7]],
    [270, [8.3, 200, 8.3, 40], [38.3, 180, 38.3, 60]],
  ])('keeps underline baseline with each native quad on a %s-degree page', async (rotation, expected, expectedSecond) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setRotation(degrees(rotation as number));
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Underline', NM: PDFString.of('synthetic'),
      Rect: [30, 440, 230, 490], QuadPoints: [30, 490, 190, 490, 30, 480, 190, 480,
        50, 460, 170, 460, 170, 450, 50, 450] }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const imported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    const { container } = render(<UnderlineNode annotation={{ ...imported, type: 'underline' }} rect={imported.rect}
      scale={1} isSelected={false} pageRotation={rotation as number} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const lines = container.querySelectorAll('svg line');
    expect(lines).toHaveLength(2);
    ['x1', 'y1', 'x2', 'y2'].forEach((key, index) =>
      expect(Number(lines[0].getAttribute(key))).toBeCloseTo((expected as number[])[index]));
    ['x1', 'y1', 'x2', 'y2'].forEach((key, index) =>
      expect(Number(lines[1].getAttribute(key))).toBeCloseTo((expectedSecond as number[])[index]));
  });

  it.each([
    [0, [0, 5.5, 160, 5.5], 'translate(0 0)'],
    [90, [44.5, 0, 44.5, 160], 'translate(50 0) rotate(90)'],
    [180, [200, 44.5, 40, 44.5], 'translate(200 50) rotate(180)'],
    [270, [5.5, 200, 5.5, 40], 'translate(0 200) rotate(270)'],
  ])('orients strikeout and squiggly previews with the %s-degree page', async (rotation, expected, transform) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setRotation(degrees(rotation as number));
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'StrikeOut', NM: PDFString.of('synthetic'),
      Rect: [30, 440, 230, 490], QuadPoints: [30, 490, 190, 490, 30, 480, 190, 480,
        50, 460, 170, 460, 50, 450, 170, 450] }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const imported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    const props = { rect: imported.rect, scale: 1, isSelected: false, pageRotation: rotation as number,
      onSelect: vi.fn(), onTransformStart: vi.fn() };
    const line = render(<StrikeoutNode {...props} annotation={{ ...imported, type: 'strikeout' }} />);
    const lines = line.container.querySelectorAll('svg line');
    expect(lines).toHaveLength(2);
    ['x1', 'y1', 'x2', 'y2'].forEach((key, index) =>
      expect(Number(lines[0].getAttribute(key))).toBeCloseTo((expected as number[])[index]));
    const wave = render(<SquigglyNode {...props} annotation={{ ...imported, type: 'squiggly' }} />);
    const paths = wave.container.querySelectorAll('svg path');
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('transform')).toBe(transform);
  });
  it('uses native PDF QuadPoints read from a synthetic imported highlight', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Highlight', NM: PDFString.of('synthetic'),
      Rect: [30, 440, 230, 490], QuadPoints: [30, 490, 190, 490, 30, 480, 190, 480,
        50, 460, 170, 460, 170, 450, 50, 450] }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const read = await readNativePdfAnnotations(await doc.save());
    expect(read.annotations).toHaveLength(1);
    const imported = read.annotations[0];
    expect(imported.type).toBe('highlight');
    const { container } = render(<HighlightNode annotation={{ ...imported, type: 'highlight' }} rect={imported.rect}
      scale={1} isSelected={false} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const marks = container.querySelectorAll('svg rect');
    expect(marks).toHaveLength(2);
    expect(Number(marks[0].getAttribute('width'))).toBeCloseTo(160);
    expect(Number(marks[1].getAttribute('x'))).toBeCloseTo(20);
    expect(Number(marks[1].getAttribute('y'))).toBeCloseTo(30);
    expect(Number(marks[1].getAttribute('width'))).toBeCloseTo(120);
  });

  it('interprets both common orders, scales to the displayed rect, and rejects ambiguous geometry', () => {
    expect(axisAlignedTextMarkupQuads(quads, 200, 100)).toEqual([
      { x: 0, y: 0, width: 160, height: 20 },
      { x: 20, y: 60, width: 120, height: 20 },
    ]);
    expect(axisAlignedTextMarkupQuads([0, 0, 1, 0, 0.2, 1, 0.8, 1], 200, 100)).toBeNull();
    expect(axisAlignedTextMarkupQuads([0, 0, 1, 0, 0, 1, NaN, 1], 200, 100)).toBeNull();
    expect(axisAlignedTextMarkupQuads([0, 0, 1, 0, 0, 1, 1, 1], 20, 100,
      { pageRotation: 0 })).toBeNull();
    expect(axisAlignedTextMarkupQuads([0, 0, 1e9, 0, 0, 0.1, 1e9, 0.1], 100, 100)).toBeNull();
    expect(axisAlignedTextMarkupQuads([0, 0, 1.01, 0, 0, 0.1, 1.01, 0.1], 100, 100)).toBeNull();
    expect(axisAlignedTextMarkupQuads(Array.from({ length: 257 }, () => [0, 0, 1, 0, 0, 1, 1, 1]).flat(),
      200, 100)).toBeNull();
    expect(axisAlignedTextMarkupQuads(quads, 200, 100, { pageRotation: 180 })).toBeNull();
    expect(axisAlignedTextMarkupQuads(quads, 200, 100, { pageRotation: undefined })).toBeNull();
    // A cyclic producer may put the lower edge first; its baseline is unknown.
    expect(axisAlignedTextMarkupQuads([0, 0.2, 0.8, 0.2, 0.8, 0, 0, 0], 200, 100,
      { pageRotation: 0 })).toBeNull();
  });

  it.each([90, 270])('renders separate rotated highlight quads on page rotation %s', async (rotation) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setRotation(degrees(rotation));
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Highlight', NM: PDFString.of('synthetic'),
      Rect: [30, 440, 230, 490], QuadPoints: [30, 490, 190, 490, 30, 480, 190, 480,
        50, 460, 170, 460, 50, 450, 170, 450] }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const imported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    const { container } = render(<HighlightNode annotation={{ ...imported, type: 'highlight' }} rect={imported.rect}
      scale={1} isSelected={false} pageRotation={rotation} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const marks = container.querySelectorAll('svg rect');
    expect(marks).toHaveLength(2);
    expect(Number(marks[0].getAttribute('width'))).toBeCloseTo(10);
    expect(Number(marks[0].getAttribute('height'))).toBeCloseTo(160);
    expect(Number(marks[1].getAttribute('width'))).toBeCloseTo(10);
    expect(Number(marks[1].getAttribute('height'))).toBeCloseTo(120);
  });

  it('caps squiggly work even when the fallback Rect is extremely large', () => {
    const annotation = { id: 'q', type: 'squiggly', pageNumber: 1, rect: { x: 0, y: 0, width: 1e9, height: 20 },
      data: { textMarkupQuads: [0, 0, 1e9, 0, 0, 0.1, 1e9, 0.1] }, createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
    const { container } = render(<SquigglyNode annotation={annotation} rect={annotation.rect} scale={1}
      isSelected={false} pageRotation={0} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const d = container.querySelector('svg path')?.getAttribute('d') ?? '';
    expect((d.match(/Q/g) ?? [])).toHaveLength(1024);
    expect(d.length).toBeLessThan(100_000);
  });

  it('caps squiggly work across many valid large quads', () => {
    const repeated = Array.from({ length: 256 }, () => [0, 0, 1, 0, 0, 1, 1, 1]).flat();
    const annotation = { id: 'q', type: 'squiggly', pageNumber: 1, rect: { x: 0, y: 0, width: 1e9, height: 20 },
      data: { textMarkupQuads: repeated }, createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
    const { container } = render(<SquigglyNode annotation={annotation} rect={annotation.rect} scale={1}
      isSelected={false} pageRotation={0} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    const paths = [...container.querySelectorAll('svg path')];
    expect(paths).toHaveLength(256);
    expect(paths.reduce((total, path) => total + (path.getAttribute('d')?.match(/Q/g)?.length ?? 0), 0)).toBeLessThanOrEqual(4096);
  });

  it.each([0, 180])('previews rectangular native underline quads on page rotation %s', async (rotation) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    page.setRotation(degrees(rotation));
    // Explicit asymmetric artwork: two separate strokes near the bottom of
    // their native, upright text quads. Rotation turns those strokes with the page.
    const ap = doc.context.register(doc.context.flateStream('q 1 0 0 RG 2 w 0 41.7 m 160 41.7 l S 20 11.7 m 140 11.7 l S Q',
      { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 200, 50], Resources: {} }));
    const root = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Underline', NM: PDFString.of('synthetic'),
      Rect: [30, 440, 230, 490], QuadPoints: [30, 490, 190, 490, 30, 480, 190, 480,
        50, 460, 170, 460, 50, 450, 170, 450], AP: { N: ap } }));
    page.node.set(PDFName.of('Annots'), doc.context.obj([root]));
    const imported = (await readNativePdfAnnotations(await doc.save())).annotations[0];
    const props = { annotation: { ...imported, type: 'underline' as const }, rect: imported.rect,
      scale: 1, isSelected: false, pageRotation: rotation, onSelect: vi.fn(), onTransformStart: vi.fn() };
    const { container } = render(<UnderlineNode {...props} />);
    const lines = container.querySelectorAll('svg line');
    expect(lines).toHaveLength(2);
    if (rotation === 0) {
      expect(Number(lines[0].getAttribute('y1'))).toBeCloseTo(8.3);
      expect(Number(lines[1].getAttribute('y1'))).toBeCloseTo(38.3);
    }
  });

  it.each(['highlight', 'underline', 'strikeout', 'squiggly'] as const)(
    'renders separate %s marks at both quads and preserves selection/move', (type) => {
      const annotation = { id: 'q', type, pageNumber: 1, rect: { x: 10, y: 20, width: 100, height: 50 },
        data: { textMarkupQuads: quads, backgroundColor: '#ffff00', borderColor: '#123456' },
        createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
      const onSelect = vi.fn(); const onTransformStart = vi.fn();
      const props = { rect: { x: 20, y: 40, width: 200, height: 100 }, scale: 2, pageRotation: 0,
        isSelected: false, onSelect, onTransformStart };
      const view = type === 'highlight' ? <HighlightNode {...props} annotation={{ ...annotation, type: 'highlight' }} />
        : type === 'underline' ? <UnderlineNode {...props} annotation={{ ...annotation, type: 'underline' }} />
          : type === 'strikeout' ? <StrikeoutNode {...props} annotation={{ ...annotation, type: 'strikeout' }} />
            : <SquigglyNode {...props} annotation={{ ...annotation, type: 'squiggly' }} />;
      const { container } = render(view);
      const selector = type === 'highlight' ? 'svg rect' : type === 'squiggly' ? 'svg path' : 'svg line';
      const marks = container.querySelectorAll(selector);
      expect(marks).toHaveLength(2);
      if (type === 'highlight') {
        expect(marks[1].getAttribute('x')).toBe('20');
        expect(marks[1].getAttribute('y')).toBe('60');
        expect(marks[1].getAttribute('width')).toBe('120');
      } else if (type === 'squiggly') {
        expect(marks[1].getAttribute('transform')).toBe('translate(20 60)');
      } else {
        expect(marks[1].getAttribute('x1')).toBe('20');
        expect(marks[1].getAttribute('x2')).toBe('140');
        expect(Number(marks[1].getAttribute('y1'))).toBeCloseTo(type === 'underline' ? 76.6 : 71);
      }
      fireEvent.pointerDown(container.firstElementChild!);
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onTransformStart).toHaveBeenCalledOnce();
      expect(onTransformStart.mock.calls[0][1]).toBe('move');
    },
  );

  it('retains the existing highlight fallback for an unsupported skewed quad', () => {
    const annotation = { id: 'q', type: 'highlight', pageNumber: 1, rect: { x: 0, y: 0, width: 100, height: 20 },
      data: { textMarkupQuads: [0, 0, 1, 0, 0.1, 1, 0.9, 1], backgroundColor: '#ffff00' },
      createdAt: 1, updatedAt: 1 } satisfies PdfAnnotation;
    const { container } = render(<HighlightNode annotation={annotation} rect={annotation.rect} scale={1}
      isSelected={false} onSelect={vi.fn()} onTransformStart={vi.fn()} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: '#ffff00' });
  });
});
