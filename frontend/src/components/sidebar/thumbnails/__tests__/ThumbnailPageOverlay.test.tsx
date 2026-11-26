import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThumbnailPageOverlay } from '../ThumbnailPageOverlay';
import type { PdfAnnotation } from '@/core/annotations/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';

describe('ThumbnailPageOverlay', () => {
  it('returns null if there are no annotations or writer elements on the page', () => {
    const { container } = render(
      <ThumbnailPageOverlay
        pageNumber={1}
        pageWidth={600}
        pageHeight={800}
        annotations={[]}
        writerElements={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders SVG ink path for freehand ink drawings', () => {
    const mockInkAnnotation: PdfAnnotation = {
      id: 'ink-1',
      pageNumber: 2,
      type: 'ink',
      rect: { x: 50, y: 50, width: 100, height: 100 },
      data: {
        points: [50, 50, 75, 80, 100, 120, 150, 150],
        borderColor: '#8b5cf6',
        borderWidth: 3,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { getByTestId, container } = render(
      <ThumbnailPageOverlay
        pageNumber={2}
        pageWidth={600}
        pageHeight={800}
        annotations={[mockInkAnnotation]}
        writerElements={[]}
      />,
    );

    const svg = getByTestId('thumbnail-overlay-page-2');
    expect(svg).toBeDefined();

    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toBe('M 50 50 L 75 80 L 100 120 L 150 150');
    expect(path?.getAttribute('stroke')).toBe('#8b5cf6');
  });

  it('renders SVG line for arrow / line annotations', () => {
    const mockLineAnnotation: PdfAnnotation = {
      id: 'line-1',
      pageNumber: 3,
      type: 'line',
      rect: { x: 10, y: 10, width: 90, height: 90 },
      data: {
        startPoint: { x: 10, y: 10 },
        endPoint: { x: 100, y: 100 },
        borderColor: '#ef4444',
        borderWidth: 2,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <ThumbnailPageOverlay
        pageNumber={3}
        pageWidth={600}
        pageHeight={800}
        annotations={[mockLineAnnotation]}
        writerElements={[]}
      />,
    );

    const line = container.querySelector('line');
    expect(line).not.toBeNull();
    expect(line?.getAttribute('x1')).toBe('10');
    expect(line?.getAttribute('y1')).toBe('10');
    expect(line?.getAttribute('x2')).toBe('100');
    expect(line?.getAttribute('y2')).toBe('100');
    expect(line?.getAttribute('stroke')).toBe('#ef4444');
  });

  it('renders miniature preview for Writer V2 elements', () => {
    const mockWriterElement: WriterElementV2 = {
      id: 'w-1',
      documentFingerprint: 'doc-1',
      pageIndex: 1, // pageNumber 2
      type: 'richTextBox',
      rect: { x: 80, y: 120, width: 200, height: 60 },
      plainText: 'Header Title',
      style: { zIndex: 1 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locked: false,
      hidden: false,
    };

    const { container } = render(
      <ThumbnailPageOverlay
        pageNumber={2}
        pageWidth={600}
        pageHeight={800}
        annotations={[]}
        writerElements={[mockWriterElement]}
      />,
    );

    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('x')).toBe('80');
    expect(rect?.getAttribute('y')).toBe('120');
    expect(rect?.getAttribute('width')).toBe('200');
    expect(rect?.getAttribute('height')).toBe('60');
  });
});
