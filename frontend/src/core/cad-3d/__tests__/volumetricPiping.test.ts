import { describe, expect, it, vi } from 'vitest';
import type { FullXmlBuilderModel } from '../../pipeline-geometry/types';
import {
  buildPipeCylinderMesh,
  buildToroidElbowMesh,
  buildVolumetricPipingScene,
} from '../pipingVolumeBuilder';
import {
  DEFAULT_CAMERA_3D,
  renderSceneMeshesToCanvas2D,
} from '../software3dRenderer';
import { buildCameraMatrix4, hexToRgba } from '../webgl3dRenderer';

describe('Phase Q2: Volumetric Pipe Cylinders, Toroid Elbows & Multi-Mesh Renderer', () => {
  it('constructs hollow annular pipe cylinders with physically accurate annular volume', () => {
    const rOut = 50; // mm
    const rIn = 40; // mm
    const lengthMm = 1000;
    const mesh = buildPipeCylinderMesh(
      'hollow_test',
      { x: 0, y: 0, z: 0 },
      { x: lengthMm, y: 0, z: 0 },
      rOut,
      rIn,
      36,
    );

    const analyticVol = Math.PI * (rOut * rOut - rIn * rIn) * lengthMm;
    expect(mesh.volume).toBeGreaterThan(analyticVol * 0.96);
    expect(mesh.volume).toBeLessThan(analyticVol * 1.04);
    expect(mesh.bounds.maxX - mesh.bounds.minX).toBeCloseTo(lengthMm, 2);
  });

  it('sweeps 90-degree toroid pipe elbows along curved arc', () => {
    const elbow = buildToroidElbowMesh(
      'elbow_90',
      { x: 850, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      150,
      Math.PI / 2,
      50,
      44,
      16,
      10,
    );

    expect(elbow.vertexCount).toBeGreaterThan(100);
    expect(elbow.triangleCount).toBeGreaterThan(100);
    // Arc starts at tangentIn (850,0,0) turning +90 deg toward +Y ending at tangentOut (1000,150,0)
    // End cross-section lies on y=150 plane with X in [950, 1050]
    expect(elbow.bounds.maxX).toBeCloseTo(1050, 1);
    expect(elbow.bounds.maxY).toBeCloseTo(150, 1);
    expect(elbow.bounds.minY).toBeCloseTo(-50, 1);
  });

  it('converts a FullXmlBuilderModel with 90/45 deg bends, wall thickness, valves, and anchors into volumetric scene', () => {
    const model: FullXmlBuilderModel = {
      coordinateRows: [
        { branchName: '/LINE-100', nodeNumber: 100, x: 0, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-100', nodeNumber: 110, x: 2000, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-100', nodeNumber: 120, x: 2000, y: 2000, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-100', nodeNumber: 130, x: 3500, y: 3500, z: 1000, pageNumber: 1, annotationId: 'a1' },
      ],
      branchRows: [
        { branchName: '/LINE-100', nodeNumber: 100, boreMm: 219.1, wallThickness: 8.18, p1: 150, t1: 120 },
      ],
      restraintRows: [
        { branchName: '/LINE-100', nodeNumber: 100, nodeName: 'ANC-1', restraintType: 'ANC' },
      ],
      weightRows: [
        {
          branchName: '/LINE-100',
          nodeNumber: 110,
          componentType: 'VALVE',
          rigid: true,
          endpoint: 120,
          weight: 85,
          componentRefNo: 'XV-101',
        },
      ],
      dtxrRows: [],
    };

    const scene = buildVolumetricPipingScene(model);
    expect(scene.elbowCount).toBe(2); // 90 deg at 110 + 45 deg at 120
    expect(scene.hollowSegmentCount).toBe(3);
    expect(scene.parts.some((p) => p.kind === 'toroid_elbow' && p.bendAngleDeg === 90)).toBe(true);
    expect(scene.parts.some((p) => p.kind === 'toroid_elbow' && p.bendAngleDeg === 45)).toBe(true);
    expect(scene.parts.some((p) => p.kind === 'component_body')).toBe(true);
    expect(scene.parts.some((p) => p.kind === 'support_shoe')).toBe(true);
    expect(scene.totalVolumeMm3).toBeGreaterThan(0);

    // Verify camera projection matrix + multi-mesh Canvas2D fallback rendering
    const proj = buildCameraMatrix4(DEFAULT_CAMERA_3D, 640, 480);
    expect(proj).toHaveLength(16);
    expect(Number.isFinite(proj[14])).toBe(true);
    expect(hexToRgba('#ef4444', 0.5)[0]).toBeCloseTo(239 / 255, 2);

    const mockCtx = {
      canvas: { width: 400, height: 300 },
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

    renderSceneMeshesToCanvas2D(
      mockCtx,
      scene.parts.map((p, idx) => ({
        id: p.id,
        mesh: p.mesh,
        color: p.color,
        highlightSeverity: idx === 0 ? 'hard' : null,
      })),
      { ...DEFAULT_CAMERA_3D, distance: 4000 },
      { viewMode: 'shaded', drawGroundGrid: true },
    );

    expect(mockCtx.fillRect).toHaveBeenCalledTimes(1);
    expect(mockCtx.fill).toHaveBeenCalled();
  });
});
