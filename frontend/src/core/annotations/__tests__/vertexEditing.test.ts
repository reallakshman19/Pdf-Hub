import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '../types';
import {
  deleteAnnotationVertex,
  insertAnnotationVertex,
  mergeConnectedPolylines,
  moveAnnotationVertex,
  orthogonalizePolyline,
  splitPolylineAtVertex,
} from '../vertexEditing';
import { useAnnotationStore } from '../store';

describe('vertexEditing pure geometry & split/merge (Layer 4)', () => {
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [], selectedAnnotationIds: [], activeAnnotationId: null });
  });

  it('moves page-space and rect-local vertices cleanly and recomputes bounding Rect', () => {
    const pipeRun: PdfAnnotation = {
      id: 'poly-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 100, height: 60 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [20, 20, 120, 20, 120, 80],
      },
    };

    const patch = moveAnnotationVertex(pipeRun, 1, { x: 160, y: 10 });
    expect(patch).not.toBeNull();
    expect(patch?.coordinateSpace).toBe('page');
    expect(patch?.points).toEqual([20, 20, 160, 10, 120, 80]);
    expect(patch?.rect).toEqual({ x: 20, y: 10, width: 140, height: 70 });

    const localLine: PdfAnnotation = {
      id: 'line-local',
      type: 'line',
      pageNumber: 1,
      rect: { x: 100, y: 96, width: 100, height: 8 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'rect-local',
        points: [0, 4, 100, 4],
      },
    };
    const localPatch = moveAnnotationVertex(localLine, 1, { x: 250, y: 160 });
    expect(localPatch?.coordinateSpace).toBe('rect-local');
    expect(localPatch?.rect).toEqual({ x: 100, y: 100, width: 150, height: 60 });
    expect(localPatch?.points).toEqual([0, 0, 150, 60]);
  });

  it('inserts midpoint vertices on polylines/polygons and guards minimum vertex deletion', () => {
    const poly: PdfAnnotation = {
      id: 'tri-1',
      type: 'shape-polygon',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [0, 0, 100, 0, 50, 100],
      },
    };

    // Cannot delete below 3 vertices on a polygon
    expect(deleteAnnotationVertex(poly, 0)).toBeNull();

    // Insert midpoint on closing segment (index 2 -> between (50,100) and (0,0))
    const inserted = insertAnnotationVertex(poly, 2);
    expect(inserted?.points).toEqual([0, 0, 100, 0, 50, 100, 25, 50]);

    const afterDelete = deleteAnnotationVertex(
      { ...poly, data: { ...poly.data, points: inserted!.points } },
      3,
    );
    expect(afterDelete?.points).toEqual([0, 0, 100, 0, 50, 100]);
  });

  it('splits a multi-vertex polyline at an interior vertex and merges touching endpoints', () => {
    const run: PdfAnnotation = {
      id: 'run-split',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 150, height: 80 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        branchName: 'P-100',
        points: [10, 10, 60, 10, 60, 90, 160, 90],
      },
    };

    // Cannot split at endpoints
    expect(splitPolylineAtVertex(run, 0)).toBeNull();
    expect(splitPolylineAtVertex(run, 3)).toBeNull();

    let seq = 0;
    const parts = splitPolylineAtVertex(run, 1, () => `part-${++seq}`);
    expect(parts).not.toBeNull();
    const [legA, legB] = parts!;
    expect(legA.data.branchName).toBe('P-100-A');
    expect(legA.data.points).toEqual([10, 10, 60, 10]);
    expect(legB.data.branchName).toBe('P-100-B');
    expect(legB.data.points).toEqual([60, 10, 60, 90, 160, 90]);

    // Merge touching runs back (including reversed tail endpoint match!)
    const reversedB: PdfAnnotation = {
      ...legB,
      data: {
        ...legB.data,
        points: [160, 90, 60, 90, 62, 10], // 2pt tolerance away from (60,10)
      },
    };
    const merged = mergeConnectedPolylines(legA, reversedB, 8, () => 'merged-1');
    expect(merged).not.toBeNull();
    expect(merged?.type).toBe('perimeter-takeoff');
    expect(merged?.data.points).toEqual([10, 10, 60, 10, 60, 90, 160, 90]);
  });

  it('commits replaceAnnotations atomically in useAnnotationStore', () => {
    const orig: PdfAnnotation = {
      id: 'orig-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [0, 0, 50, 0, 100, 50],
      },
    };

    useAnnotationStore.setState({ annotations: [orig], selectedAnnotationIds: [orig.id] });
    const parts = splitPolylineAtVertex(orig, 1, () => `split-${Math.random()}`);
    expect(parts).not.toBeNull();

    useAnnotationStore.getState().replaceAnnotations([orig.id], parts!, 'Split pipe run');
    const current = useAnnotationStore.getState().annotations;
    expect(current).toHaveLength(2);
    expect(current.some((a) => a.id === 'orig-1')).toBe(false);
  });

  it('orthogonalizes noisy traced polylines to 90° ortho and 45° iso and collapses collinear nodes', () => {
    // Slightly tilted horizontal leg with an extra nearly-collinear point, then vertical leg
    const noisyOrtho: PdfAnnotation = {
      id: 'noisy-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 100, height: 85 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [10, 10, 60, 10.8, 110, 12, 108, 95],
      },
    };

    const orthoPatch = orthogonalizePolyline(noisyOrtho, { stepDeg: 90 });
    expect(orthoPatch).not.toBeNull();
    // Should snap horizontal leg cleanly to y=10, collapse redundant midpoint, and snap vertical leg to x=110
    expect(orthoPatch?.points).toEqual([10, 10, 110, 10, 110, 95]);

    // 45° isometric diagonal riser test
    const noisyIso: PdfAnnotation = {
      id: 'noisy-iso',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [0, 0, 50, 2, 100, 48], // horizontal leg + ~43° diagonal leg
      },
    };

    const isoPatch = orthogonalizePolyline(noisyIso, { stepDeg: 45 });
    expect(isoPatch).not.toBeNull();
    // Second leg should have equal |dx| and |dy| (45°) starting from (50, 0)
    const pts = isoPatch!.points;
    expect(pts[0]).toBe(0);
    expect(pts[1]).toBe(0);
    expect(pts[2]).toBe(50);
    expect(pts[3]).toBe(0);
    expect(Math.abs(pts[4] - 50)).toBeCloseTo(Math.abs(pts[5] - 0), 2);
  });
});
