import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';
import { HighlightNode } from './HighlightNode';
import { UnderlineNode } from './UnderlineNode';
import { StrikeoutNode } from './StrikeoutNode';
import { SquigglyNode } from './SquigglyNode';
import { axisAlignedTextMarkupQuads } from './shared/textMarkupQuads';

// The two quads use Z and perimeter ordering, respectively.
const quads = [0, 0, 0.8, 0, 0, 0.2, 0.8, 0.2,
  0.1, 0.6, 0.7, 0.6, 0.7, 0.8, 0.1, 0.8];

describe('native multi-quad text-markup previews', () => {
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

  it.each([0, 180])('disables the new oriented line preview where page rotation %s is ambiguous', async (rotation) => {
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
    expect(lines).toHaveLength(rotation === 0 ? 2 : 1);
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
