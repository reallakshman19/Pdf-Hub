import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiColumnOverlay } from '../MultiColumnOverlay';
import type { MultiColumnLayout } from '@/core/existing-text/columnFlowTypes';

describe('MultiColumnOverlay', () => {
  const layout: MultiColumnLayout = {
    pageIndex: 0,
    pageId: 'p-1',
    columnCount: 2,
    readingOrder: [0, 1],
    averageLeadingPt: 14,
    fontSizePt: 12,
    fontName: 'Helvetica',
    columns: [
      {
        columnIndex: 0,
        leftPt: 72,
        topPt: 700,
        widthPt: 200,
        heightPt: 100,
        gutterRightPt: 24,
        maxLines: 7,
        baselineYsPt: [700, 686, 672],
      },
      {
        columnIndex: 1,
        leftPt: 296,
        topPt: 700,
        widthPt: 200,
        heightPt: 100,
        gutterRightPt: 0,
        maxLines: 7,
        baselineYsPt: [700, 686, 672],
      },
    ],
  };

  it('renders nothing when visible is false or layout is null', () => {
    const { container: c1 } = render(
      <MultiColumnOverlay layout={null} pageHeightPt={792} scale={1} />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <MultiColumnOverlay layout={layout} pageHeightPt={792} scale={1} visible={false} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it('renders column boxes and labels with inverted PDF-to-DOM Y coordinates (Falsifier 1)', () => {
    render(
      <MultiColumnOverlay layout={layout} pageHeightPt={792} scale={1.5} />,
    );

    expect(screen.getByTestId('multi-column-overlay')).toBeInTheDocument();
    const col0 = screen.getByTestId('column-box-0');
    const col1 = screen.getByTestId('column-box-1');

    expect(col0).toBeInTheDocument();
    expect(col1).toBeInTheDocument();

    // col.topPt is 700, pageHeight is 792 => topPt = 792 - 700 = 92pt => * 1.5 = 138px
    expect(col0.style.top).toBe('138px');
    expect(col0.style.left).toBe('108px'); // 72 * 1.5 = 108px
    expect(col0.style.width).toBe('300px'); // 200 * 1.5 = 300px
    expect(col0.style.height).toBe('150px'); // 100 * 1.5 = 150px

    expect(screen.getByText('Col 1')).toBeInTheDocument();
    expect(screen.getByText('Col 2')).toBeInTheDocument();
  });

  it('renders shaded gutter box between Column 0 and Column 1', () => {
    render(
      <MultiColumnOverlay layout={layout} pageHeightPt={792} scale={1} />,
    );

    const gutter = screen.getByTestId('gutter-box-0');
    expect(gutter).toBeInTheDocument();
    // gutter starts at leftPt (72) + widthPt (200) = 272px
    expect(gutter.style.left).toBe('272px');
    // gutter width is 24px
    expect(gutter.style.width).toBe('24px');
    expect(screen.getByText('24pt')).toBeInTheDocument();
  });
});
