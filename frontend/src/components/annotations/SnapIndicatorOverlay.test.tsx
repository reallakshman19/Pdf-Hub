import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SnapIndicatorOverlay } from './SnapIndicatorOverlay';
import type { SnapResult } from '../../core/annotations/cadSnapping';

describe('SnapIndicatorOverlay', () => {
  it('returns null when no snap target is active', () => {
    const { container } = render(
      <SnapIndicatorOverlay
        snapResult={null}
        scale={1}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders square glyph and Endpoint label when snapped to endpoint', () => {
    const snapResult: SnapResult = {
      point: { x: 100, y: 150 },
      distance: 2,
      snapped: true,
      kind: 'endpoint',
    };

    render(
      <SnapIndicatorOverlay
        snapResult={snapResult}
        scale={1}
      />,
    );

    expect(screen.getByTestId('snap-glyph-square')).toBeInTheDocument();
    expect(screen.getByText('Endpoint')).toBeInTheDocument();
  });

  it('renders triangle glyph and Midpoint label when snapped to midpoint', () => {
    const snapResult: SnapResult = {
      point: { x: 200, y: 250 },
      distance: 3,
      snapped: true,
      kind: 'midpoint',
    };

    render(
      <SnapIndicatorOverlay
        snapResult={snapResult}
        scale={1}
      />,
    );

    expect(screen.getByTestId('snap-glyph-midpoint')).toBeInTheDocument();
    expect(screen.getByText('Midpoint')).toBeInTheDocument();
  });

  it('renders circle glyph and Center label when snapped to center', () => {
    const snapResult: SnapResult = {
      point: { x: 300, y: 350 },
      distance: 1,
      snapped: true,
      kind: 'center',
    };

    render(
      <SnapIndicatorOverlay
        snapResult={snapResult}
        scale={1}
      />,
    );

    expect(screen.getByTestId('snap-glyph-center')).toBeInTheDocument();
    expect(screen.getByText('Center')).toBeInTheDocument();
  });

  it('renders dashed orthogonal guideline when angle constraint is active', () => {
    const snapResult: SnapResult = {
      point: { x: 150, y: 150 },
      distance: 0,
      snapped: false,
    };

    render(
      <SnapIndicatorOverlay
        snapResult={snapResult}
        originPoint={{ x: 50, y: 50 }}
        isAngleConstrained={true}
        scale={1}
      />,
    );

    expect(screen.getByTestId('snap-guide-line')).toBeInTheDocument();
    expect(screen.getByText('45° Ortho')).toBeInTheDocument();
  });
});
