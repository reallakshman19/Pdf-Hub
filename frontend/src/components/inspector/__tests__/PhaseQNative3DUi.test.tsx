import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { Piping3DViewer } from '../Piping3DViewer';
import { Cad3DInspectorSection } from '../Cad3DInspectorSection';
import { Cad3DViewportDock } from '../../cad/Cad3DViewportDock';
import { useCadModelingStore } from '@/core/cad-modeling/store';
import { useSessionStore } from '@/core/session/store';
import { extrudePolygonTo3D } from '@/core/cad-3d/extrudeEngine';
import { embedU3DMeshInPdf } from '@/core/cad-3d/pdf3dAnnotation';
import type { FullXmlBuilderModel } from '@/core/pipeline-geometry/types';

// Stub 2D canvas context cleanly for JSDOM volumetric render verification
beforeEach(() => {
  useCadModelingStore.getState().reset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId === '2d') {
      return {
        canvas: { width: 380, height: 320 },
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  });
});

describe('Phase Q4 UI: Volumetric Piping, Clash Audit & Native 3D PDF Stream Loading', () => {
  it('toggles Piping3DViewer into Volumetric Solid Mode and displays Spatial Clash Audit results', () => {
    const clashingModel: FullXmlBuilderModel = {
      coordinateRows: [
        { branchName: '/LINE-A', nodeNumber: 10, x: 0, y: 0, z: 0, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-A', nodeNumber: 20, x: 2000, y: 0, z: 0, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-A', nodeNumber: 30, x: 2000, y: 2000, z: 0, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-B', nodeNumber: 40, x: 1000, y: -1000, z: 0, pageNumber: 1, annotationId: 'a2' },
        { branchName: '/LINE-B', nodeNumber: 50, x: 1000, y: 1000, z: 0, pageNumber: 1, annotationId: 'a2' },
      ],
      branchRows: [
        { branchName: '/LINE-A', nodeNumber: 10, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
        { branchName: '/LINE-B', nodeNumber: 40, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
      ],
      restraintRows: [],
      weightRows: [],
      dtxrRows: [],
    };

    render(<Piping3DViewer model={clashingModel} />);

    // Default starts in SVG wireframe mode
    expect(screen.queryByTestId('piping-volumetric-canvas')).toBeNull();

    // Switch to Volumetric Solid 3D mode
    fireEvent.click(screen.getByTestId('piping-mode-volumetric'));

    expect(screen.getByTestId('piping-volumetric-canvas')).toBeInTheDocument();
    const summary = screen.getByTestId('piping-clash-summary');
    expect(summary).toHaveTextContent('1 Hard Clash');
    expect(summary).toHaveTextContent('Elbows: 1');

    // Interactive click selects clash highlight
    fireEvent.click(screen.getByTestId('piping-clash-item-0'));
    expect(useCadModelingStore.getState().selectedClashId).toBeTruthy();
  });

  it('scans active PDF for /Subtype /3D U3D annotations and loads extracted mesh into Cad3DViewportDock', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 600]);
    const baseBytes = await doc.save();

    const valveBody = extrudePolygonTo3D(
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      { depth: 20, meshId: 'ValveU3DMesh' },
    );

    const embedded = await embedU3DMeshInPdf(baseBytes, [valveBody], {
      annotationName: 'CAD_Valve_U3D',
    });

    useSessionStore.setState({ workingBytes: embedded.pdfBytes });

    render(
      <>
        <Cad3DInspectorSection />
        <Cad3DViewportDock />
      </>,
    );

    fireEvent.click(screen.getByTestId('inspector-btn-scan-3dpdf'));

    await waitFor(() => {
      expect(screen.getByTestId('inspector-pdf3d-status')).toHaveTextContent(
        'Found 1 native 3D stream(s)',
      );
    });

    fireEvent.click(screen.getByTestId('inspector-btn-load-u3d-mesh'));

    expect(screen.getByTestId('cad-3d-viewport-dock')).toBeInTheDocument();
    expect(screen.getByTestId('dock-u3d-badge')).toHaveTextContent('U3D: ValveU3DMesh');
    expect(screen.getByTestId('dock-3d-canvas')).toBeInTheDocument();
  });
});
