import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '../types';
import {
  computeRectFromPagePoints,
  getAnnotationLocalPoints,
  getAnnotationPagePoints,
  getAnnotationPageVertices,
  rebaseAnnotationToPageSpace,
  resolveAnnotationPointsSpace,
} from '../pointsSpace';
import { extractSnapPointsFromAnnotation } from '../cadSnapping';
import { harvestLoopsFromAnnotations } from '../../cad-modeling/annotationLoops';
import { toLocalAnnotationPoints } from '../../../adapters/annotation-canvas/KonvaAdapter';

describe('canonical annotation coordinateSpace (Layer 2)', () => {
  it('honors explicit coordinateSpace even when page points fit inside rect width/height', () => {
    // Regression guard: rect has width=120, height=120 at (20,20); page point (80,80) is < 120!
    // Heuristic bounds checks would falsely treat it as rect-local, causing +20/+20 drift.
    const pageSpacePoly: PdfAnnotation = {
      id: 'pipe-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 20, y: 20, width: 120, height: 120 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [20, 20, 80, 20, 80, 80],
      },
    };

    expect(resolveAnnotationPointsSpace(pageSpacePoly)).toBe('page');
    expect(getAnnotationPagePoints(pageSpacePoly)).toEqual([20, 20, 80, 20, 80, 80]);
    expect(getAnnotationLocalPoints(pageSpacePoly)).toEqual([0, 0, 60, 0, 60, 60]);
    expect(toLocalAnnotationPoints([20, 20, 80, 20, 80, 80], 20, 20, 120, 120, 'page')).toEqual([
      0, 0, 60, 0, 60, 60,
    ]);

    const localLine: PdfAnnotation = {
      id: 'line-local',
      type: 'line',
      pageNumber: 1,
      rect: { x: 200, y: 150, width: 100, height: 40 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'rect-local',
        points: [0, 20, 100, 20],
      },
    };

    expect(resolveAnnotationPointsSpace(localLine)).toBe('rect-local');
    expect(getAnnotationLocalPoints(localLine)).toEqual([0, 20, 100, 20]);
    expect(getAnnotationPagePoints(localLine)).toEqual([200, 170, 300, 170]);

    const rebased = rebaseAnnotationToPageSpace(localLine);
    expect(rebased.data.coordinateSpace).toBe('page');
    expect(rebased.data.points).toEqual([200, 170, 300, 170]);
  });

  it('extracts accurate page-space snap points for both rect-local lines and page-space polylines', () => {
    const localLine: PdfAnnotation = {
      id: 'line-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 100, y: 200, width: 80, height: 8 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'rect-local',
        points: [0, 4, 80, 4],
      },
    };

    const snaps = extractSnapPointsFromAnnotation(localLine);
    const endpoints = snaps.filter((s) => s.kind === 'endpoint');
    expect(endpoints.map((s) => s.point)).toEqual([
      { x: 100, y: 204 },
      { x: 180, y: 204 },
    ]);
    const midpoints = snaps.filter((s) => s.kind === 'midpoint');
    expect(midpoints.some((s) => s.point.x === 140 && s.point.y === 204)).toBe(true);

    const openPolyline: PdfAnnotation = {
      id: 'poly-line-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 10, y: 10, width: 100, height: 50 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [10, 10, 110, 10, 110, 60],
      },
    };
    const polySnaps = extractSnapPointsFromAnnotation(openPolyline);
    // Open polyline must have 3 endpoints, segment midpoints (60,10) & (110,35), and no closing edge midpoint
    expect(polySnaps.filter((s) => s.kind === 'endpoint')).toHaveLength(3);
    const segMidpoints = polySnaps.filter(
      (s) => s.kind === 'midpoint' && s.sourceDescription?.includes('segment'),
    );
    expect(segMidpoints.map((s) => s.point)).toEqual([
      { x: 60, y: 10 },
      { x: 110, y: 35 },
    ]);
    expect(polySnaps.some((s) => s.sourceDescription?.includes('closing'))).toBe(false);
  });

  it('computes clickable bounding rects centered on degenerate horizontal/vertical lines', () => {
    const hRect = computeRectFromPagePoints([50, 100, 250, 100], 8);
    expect(hRect).toEqual({ x: 50, y: 96, width: 200, height: 8 });

    const verts = getAnnotationPageVertices({
      type: 'perimeter-takeoff',
      rect: hRect,
      data: { coordinateSpace: 'page', points: [50, 100, 250, 100] },
    });
    expect(verts).toEqual([
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]);
  });

  it('harvests DCEL closed loops from rect-local diagonal lines and multi-vertex polylines', () => {
    // 2 segments in one perimeter-takeoff + 1 closing rect-local line = triangle (0,0)-(100,0)-(100,60)
    const pipeRun: PdfAnnotation = {
      id: 'pipe-2seg',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 60 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'page',
        points: [0, 0, 100, 0, 100, 60],
      },
    };
    const closingDiag: PdfAnnotation = {
      id: 'diag-close',
      type: 'line',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 60 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        coordinateSpace: 'rect-local',
        points: [100, 60, 0, 0],
      },
    };

    const loops = harvestLoopsFromAnnotations([pipeRun, closingDiag]);
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBeCloseTo(3000, 1);
  });
});
