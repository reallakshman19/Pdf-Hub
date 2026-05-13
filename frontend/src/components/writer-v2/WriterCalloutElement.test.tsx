import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { createTextCalloutElement } from '@/core/writer-v2/writerElementFactory';
import { WriterCalloutElement } from './WriterCalloutElement';

const viewport: WriterPageViewport = {
  pdfWidth: 612,
  pdfHeight: 792,
  scale: 1,
  rotation: 0,
};

function calloutElement(patch: Partial<WriterElementV2> = {}): WriterElementV2 {
  return {
    ...createTextCalloutElement({
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      rect: { x: 100, y: 100, width: 150, height: 80 },
      text: 'Callout text',
      anchorPoint: { x: 50, y: 50 },
    }),
    ...patch,
  };
}

describe('WriterCalloutElement', () => {
  const commonProps = {
    viewport,
    selected: false,
    isEditing: false,
    onBeginDrag: vi.fn(),
    onUpdateDrag: vi.fn(),
    onEndDrag: vi.fn(),
    onDoubleClick: vi.fn(),
    viewportRect: { x: 100, y: 612, width: 150, height: 80 },
  };

  it('renders SVG leader line when anchor is present', () => {
    const el = calloutElement();

    render(
      <WriterCalloutElement
        element={el}
        {...commonProps}
      />,
    );

    const svg = document.querySelector('svg.callout-leader-layer');
    expect(svg).toBeTruthy();

    const line = document.querySelector('line');
    expect(line).toBeTruthy();
    expect(line?.getAttribute('x1')).toBe('50');
    // y1 is calculated as pdfHeight - y in default viewport: 792 - 50 = 742
    expect(line?.getAttribute('y1')).toBe('742');
  });

  it('renders arrow marker if leaderStyle is arrow', () => {
    const el = calloutElement();

    render(
      <WriterCalloutElement
        element={el}
        {...commonProps}
      />,
    );

    const marker = document.querySelector('marker');
    expect(marker).toBeTruthy();
    expect(marker?.getAttribute('id')).toBe(`arrowhead-${el.id}`);
  });

  it('renders the content box securely', () => {
    const el = calloutElement();

    render(
      <WriterCalloutElement
        element={el}
        {...commonProps}
      />,
    );

    expect(screen.getByText('Callout text')).toBeTruthy();
  });
});
