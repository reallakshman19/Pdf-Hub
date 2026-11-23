import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipingValveNode } from './PipingValveNode';
import type { PdfAnnotation } from '../../core/annotations/types';

describe('PipingValveNode', () => {
  it('renders standard valve glyph with tag and weight badge', () => {
    const ann: PdfAnnotation = {
      id: 'valve-1',
      type: 'piping-valve',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 50, height: 36 },
      data: {
        componentType: 'VALVE',
        componentRefNo: 'V-101',
        weight: 125,
      },
      createdAt: 0,
      updatedAt: 0,
    };

    const onSelect = vi.fn();
    render(
      <PipingValveNode
        annotation={ann as any}
        rect={ann.rect}
        scale={1}
        isSelected={false}
        onSelect={onSelect}
        onTransformStart={vi.fn()}
      />,
    );

    expect(screen.getByTestId('piping-valve-node')).toBeInTheDocument();
    expect(screen.getByTestId('valve-svg-valve')).toBeInTheDocument();
    expect(screen.getByText('V-101')).toBeInTheDocument();
    expect(screen.getByText('125kg')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('piping-valve-node'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
