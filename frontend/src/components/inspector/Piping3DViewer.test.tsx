import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Piping3DViewer } from './Piping3DViewer';
import type { FullXmlBuilderModel } from '@/core/pipeline-geometry/types';

describe('Piping3DViewer component', () => {
  const mockModel: FullXmlBuilderModel = {
    coordinateRows: [
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 100,
        x: 0,
        y: 0,
        z: 100000,
        pageNumber: 1,
        annotationId: 'ann-1',
        lengthToNextMm: 2500,
      },
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 110,
        x: 2500,
        y: 0,
        z: 100000,
        pageNumber: 1,
        annotationId: 'ann-1',
        lengthToNextMm: 1500,
      },
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 120,
        x: 2500,
        y: 1500,
        z: 103000,
        pageNumber: 1,
        annotationId: 'ann-1',
      },
    ],
    branchRows: [
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 100,
        boreMm: 100,
        wallThickness: 6.02,
        p1: 16,
        t1: 120,
      },
    ],
    restraintRows: [
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 100,
        nodeName: 'ANC-1',
        restraintType: 'ANC',
      },
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 110,
        nodeName: 'GUIDE-1',
        restraintType: 'GUIDE',
      },
    ],
    weightRows: [
      {
        branchName: '/PIPE-1/B1',
        nodeNumber: 110,
        componentType: 'VALVE',
        rigid: true,
        endpoint: 111,
        weight: 65,
        componentRefNo: 'V-101',
      },
    ],
    dtxrRows: [],
  };

  it('renders empty state placeholder when no coordinates are present', () => {
    const emptyModel: FullXmlBuilderModel = {
      coordinateRows: [],
      branchRows: [],
      restraintRows: [],
      weightRows: [],
      dtxrRows: [],
    };

    render(<Piping3DViewer model={emptyModel} />);
    expect(screen.getByText(/Draw pipe lines or polylines to view 3D route/i)).toBeInTheDocument();
  });

  it('renders 3D nodes, node labels, and pipe segments', () => {
    render(<Piping3DViewer model={mockModel} />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('(3 nodes)')).toBeInTheDocument();
  });

  it('switches camera presets when clicking view buttons', () => {
    render(<Piping3DViewer model={mockModel} />);

    const planBtn = screen.getByRole('button', { name: /Plan/i });
    const elevBtn = screen.getByRole('button', { name: /Elev/i });
    const isoBtn = screen.getByRole('button', { name: /ISO/i });

    fireEvent.click(planBtn);
    fireEvent.click(elevBtn);
    fireEvent.click(isoBtn);

    expect(screen.getByTestId('piping-3d-viewer')).toBeInTheDocument();
  });

  it('notifies onSelectNode when a node is clicked and displays telemetry', () => {
    const onSelectNode = vi.fn();
    render(
      <Piping3DViewer
        model={mockModel}
        selectedNode={110}
        onSelectNode={onSelectNode}
      />,
    );

    // Selected node 110 telemetry should be visible
    expect(screen.getByText(/Node 110:/i)).toBeInTheDocument();
    expect(screen.getByText(/X: 2,500 mm/i)).toBeInTheDocument();

    // Click node 120
    const node120Label = screen.getByText('120');
    fireEvent.click(node120Label);
    expect(onSelectNode).toHaveBeenCalledWith(120);
  });
});
