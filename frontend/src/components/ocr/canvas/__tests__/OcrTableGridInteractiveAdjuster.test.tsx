import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OcrTableGridInteractiveAdjuster } from '../OcrTableGridInteractiveAdjuster';
import type { OcrTableBlock } from '@/core/ocr/types';

describe('OcrTableGridInteractiveAdjuster', () => {
  const sampleTable: OcrTableBlock = {
    id: 'tbl-adj',
    type: 'table',
    rect: { x: 50, y: 50, width: 200, height: 100 },
    bbox: { x: 50, y: 50, width: 200, height: 100 },
    rows: [
      {
        id: 'r1',
        cells: [
          { id: 'c1', text: 'A', confidence: 0.9, bbox: { x: 50, y: 50, width: 100, height: 50 } },
          { id: 'c2', text: 'B', confidence: 0.9, bbox: { x: 150, y: 50, width: 100, height: 50 } },
        ],
      },
      {
        id: 'r2',
        cells: [
          { id: 'c3', text: 'C', confidence: 0.9, bbox: { x: 50, y: 100, width: 100, height: 50 } },
          { id: 'c4', text: 'D', confidence: 0.9, bbox: { x: 150, y: 100, width: 100, height: 50 } },
        ],
      },
    ],
  };

  it('renders divider drag handles matching table geometry', () => {
    render(
      <OcrTableGridInteractiveAdjuster
        table={sampleTable}
        scale={1.0}
        onTableUpdate={vi.fn()}
      />
    );

    expect(screen.getByTestId('ocr-table-grid-adjuster')).toBeInTheDocument();
    expect(screen.getByTestId('col-divider-handle-0')).toBeInTheDocument();
    expect(screen.getByTestId('row-divider-handle-0')).toBeInTheDocument();
  });

  it('calls onTableUpdate on mouse drag movement', () => {
    const handleUpdate = vi.fn();
    render(
      <OcrTableGridInteractiveAdjuster
        table={sampleTable}
        scale={1.0}
        onTableUpdate={handleUpdate}
      />
    );

    const colHandle = screen.getByTestId('col-divider-handle-0');
    fireEvent.mouseDown(colHandle, { clientX: 150 });

    fireEvent.mouseMove(window, { clientX: 170 });
    expect(handleUpdate).toHaveBeenCalled();

    fireEvent.mouseUp(window);
  });
});
