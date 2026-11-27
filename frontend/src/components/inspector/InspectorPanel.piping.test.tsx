import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

describe('InspectorPanel CAD / Pipe Run controls (Layer 4)', () => {
  beforeEach(() => {
    useEditorStore.setState({ inspectorTab: 'properties', rightPanelWidth: 18, activeMode: 'annotate' });
  });

  it('edits branch tag and elevation Z and splits a multi-vertex pipe run at an interior vertex', () => {
    const run: PdfAnnotation = {
      id: 'pipe-edit-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 140, height: 80 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        isPipeRun: true,
        branchName: '4"-P-100',
        cadLayerName: 'A-PIPING',
        points: [20, 20, 80, 20, 80, 100, 160, 100],
      },
    };

    useAnnotationStore.setState({
      annotations: [run],
      selectedAnnotationIds: [run.id],
      activeAnnotationId: run.id,
    });

    render(<InspectorPanel />);

    expect(screen.getByTestId('inspector-cad-pipe-section')).toBeInTheDocument();
    expect(screen.getByText('4 vertices')).toBeInTheDocument();
    expect(screen.getByText('A-PIPING')).toBeInTheDocument();

    const branchInput = screen.getByLabelText('Branch / Line Tag') as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: '6"-P-500-SS' } });

    const afterRename = useAnnotationStore.getState().annotations[0];
    expect(afterRename.data.branchName).toBe('6"-P-500-SS');
    expect(afterRename.data.text).toBe('6"-P-500-SS');

    const elevInput = screen.getByLabelText('Elevation Z (mm)') as HTMLInputElement;
    fireEvent.change(elevInput, { target: { value: '104500' } });
    expect(useAnnotationStore.getState().annotations[0].data.elevationZ).toBe(104500);

    // Split at Vertex #2 (index 1)
    fireEvent.click(screen.getByTestId('split-polyline-btn'));
    const nextList = useAnnotationStore.getState().annotations;
    expect(nextList).toHaveLength(2);
    expect(nextList[0].data.branchName).toBe('6"-P-500-SS-A');
    expect(nextList[1].data.branchName).toBe('6"-P-500-SS-B');
  });

  it('merges two selected touching pipe runs into one continuous run', () => {
    const leg1: PdfAnnotation = {
      id: 'leg-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 90, height: 8 },
      createdAt: 1,
      updatedAt: 1,
      data: { coordinateSpace: 'page', branchName: 'HDR-1', points: [10, 10, 100, 10] },
    };
    const leg2: PdfAnnotation = {
      id: 'leg-2',
      type: 'line',
      pageNumber: 1,
      rect: { x: 100, y: 10, width: 8, height: 80 },
      createdAt: 2,
      updatedAt: 2,
      data: { coordinateSpace: 'page', points: [100, 10, 100, 90] },
    };

    useAnnotationStore.setState({
      annotations: [leg1, leg2],
      selectedAnnotationIds: [leg1.id, leg2.id],
      activeAnnotationId: leg1.id,
    });

    render(<InspectorPanel />);

    fireEvent.click(screen.getByTestId('merge-polylines-btn'));
    const merged = useAnnotationStore.getState().annotations;
    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe('perimeter-takeoff');
    expect(merged[0].data.branchName).toBe('HDR-1');
    expect(merged[0].data.points).toEqual([10, 10, 100, 10, 100, 90]);
  });

  it('snaps a noisy raster-traced pipe run to 90° orthogonal via Snap Ortho button', () => {
    const noisyRun: PdfAnnotation = {
      id: 'noisy-pipe-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 100, height: 80 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        isPipeRun: true,
        importedFromRasterTrace: true,
        points: [20, 20, 70, 20.6, 120, 22, 118, 100],
      },
    };

    useAnnotationStore.setState({
      annotations: [noisyRun],
      selectedAnnotationIds: [noisyRun.id],
      activeAnnotationId: noisyRun.id,
    });

    render(<InspectorPanel />);

    fireEvent.click(screen.getByTestId('clean-ortho-run-btn'));
    const updated = useAnnotationStore.getState().annotations[0];
    expect(updated.data.points).toEqual([20, 20, 120, 20, 120, 100]);
  });
});
