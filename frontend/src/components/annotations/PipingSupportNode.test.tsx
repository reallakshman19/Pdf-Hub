import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipingSupportNode } from './PipingSupportNode';
import type { PdfAnnotation } from '../../core/annotations/types';

describe('PipingSupportNode', () => {
  it('renders Anchor (ANC) glyph with label and handles click', () => {
    const ann: PdfAnnotation = {
      id: 'supp-anc',
      type: 'piping-support',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 40, height: 40 },
      data: {
        restraintType: 'ANC',
        nodeName: 'ANC-100',
      },
      createdAt: 0,
      updatedAt: 0,
    };

    const onSelect = vi.fn();
    render(
      <PipingSupportNode
        annotation={ann as never}
        rect={ann.rect}
        scale={1}
        isSelected={false}
        onSelect={onSelect}
        onTransformStart={vi.fn()}
      />,
    );

    expect(screen.getByTestId('piping-support-node')).toBeInTheDocument();
    expect(screen.getByTestId('support-svg-anc')).toBeInTheDocument();
    expect(screen.getByText('ANC-100')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('piping-support-node'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders Guide (GUIDE) glyph with label', () => {
    const ann: PdfAnnotation = {
      id: 'supp-guide',
      type: 'piping-support',
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 40, height: 40 },
      data: {
        restraintType: 'GUIDE',
        nodeName: 'G-110',
      },
      createdAt: 0,
      updatedAt: 0,
    };

    render(
      <PipingSupportNode
        annotation={ann as never}
        rect={ann.rect}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onTransformStart={vi.fn()}
      />,
    );

    expect(screen.getByTestId('support-svg-guide')).toBeInTheDocument();
    expect(screen.getByText('G-110')).toBeInTheDocument();
  });
});
