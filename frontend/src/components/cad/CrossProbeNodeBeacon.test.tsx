import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CrossProbeNodeBeacon } from './CrossProbeNodeBeacon';
import type { PipelineCoordinateRow } from '@/core/pipeline-geometry/types';

describe('CrossProbeNodeBeacon Component', () => {
  const sampleNode: PipelineCoordinateRow = {
    branchName: '/PIPE-4/B1',
    nodeNumber: 110,
    x: 2500,
    y: 1200,
    z: 105000,
    pageNumber: 1,
    annotationId: 'pipe-1',
    pdfPoint: { x: 300, y: 450 },
    lengthToNextMm: 2000,
  };

  it('renders beacon at correct scaled pixel coordinates', () => {
    const scale = 1.5;
    render(
      <CrossProbeNodeBeacon
        node={sampleNode}
        scale={scale}
      />
    );

    const beacon = screen.getByTestId('cross-probe-node-beacon');
    expect(beacon).toBeInTheDocument();
    // 300 * 1.5 = 450px left, 450 * 1.5 = 675px top
    expect(beacon).toHaveStyle({
      left: '450px',
      top: '675px',
    });
  });

  it('renders node telemetry badge with node number, elevation Z, and branch', () => {
    render(
      <CrossProbeNodeBeacon
        node={sampleNode}
        scale={1.0}
      />
    );

    expect(screen.getByText('Node #110')).toBeInTheDocument();
    expect(screen.getByText(/1,05,000 mm|105,000 mm/)).toBeInTheDocument();
    expect(screen.getByText('/PIPE-4/B1')).toBeInTheDocument();
  });

  it('calls onDismiss when clicking dismiss button', () => {
    const mockOnDismiss = vi.fn();
    render(
      <CrossProbeNodeBeacon
        node={sampleNode}
        scale={1.0}
        onDismiss={mockOnDismiss}
      />
    );

    const dismissBtn = screen.getByTestId('beacon-dismiss-btn');
    fireEvent.click(dismissBtn);

    expect(mockOnDismiss).toHaveBeenCalled();
  });

  it('returns null if node has no pdfPoint', () => {
    const nodeWithoutPoint: PipelineCoordinateRow = {
      ...sampleNode,
      pdfPoint: undefined,
    };

    const { container } = render(
      <CrossProbeNodeBeacon
        node={nodeWithoutPoint}
        scale={1.0}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
