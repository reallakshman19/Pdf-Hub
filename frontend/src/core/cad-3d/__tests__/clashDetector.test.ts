import { describe, expect, it } from 'vitest';
import type { FullXmlBuilderModel } from '../../pipeline-geometry/types';
import { buildVolumetricPipingScene } from '../pipingVolumeBuilder';
import { closestDistanceBetweenSegments3D, runSpatialClashAudit } from '../clashDetector';
import { extrudePolygonTo3D } from '../extrudeEngine';

describe('Phase Q3: Spatial Hash Grid Clash Detection & Clearance Auditing', () => {
  it('detects HARD_CLASH for physically intersecting pipe runs across branches without false-positives on same-branch connected elbows', () => {
    const model: FullXmlBuilderModel = {
      coordinateRows: [
        // Line A runs East-West with a 90 deg bend (connected elbow must NOT report clash)
        { branchName: '/LINE-A', nodeNumber: 10, x: 0, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-A', nodeNumber: 20, x: 2000, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-A', nodeNumber: 30, x: 2000, y: 2000, z: 1000, pageNumber: 1, annotationId: 'a1' },
        // Line B crosses Line A directly at (1000, 0, 1000) -> physical penetration!
        { branchName: '/LINE-B', nodeNumber: 100, x: 1000, y: -1000, z: 1000, pageNumber: 1, annotationId: 'a2' },
        { branchName: '/LINE-B', nodeNumber: 110, x: 1000, y: 1000, z: 1000, pageNumber: 1, annotationId: 'a2' },
      ],
      branchRows: [
        { branchName: '/LINE-A', nodeNumber: 10, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
        { branchName: '/LINE-B', nodeNumber: 100, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
      ],
      restraintRows: [],
      weightRows: [],
      dtxrRows: [],
    };

    const scene = buildVolumetricPipingScene(model);
    const audit = runSpatialClashAudit(scene.parts, { minClearanceMm: 50 });

    expect(audit.hardClashCount).toBe(1);
    expect(audit.clearanceViolationCount).toBe(0);
    expect(audit.clashes[0].severity).toBe('HARD_CLASH');
    expect(audit.clashes[0].penetrationDepthMm).toBeCloseTo(100, 1); // rA=50 + rB=50 at zero centerline distance
    expect(audit.clashes[0].clashPoint.x).toBeCloseTo(1000, 1);
    expect(audit.clashes[0].clashPoint.y).toBeCloseTo(0, 1);
  });

  it('detects CLEARANCE_VIOLATION when non-intersecting pipes violate minimum clearance threshold', () => {
    const model: FullXmlBuilderModel = {
      coordinateRows: [
        { branchName: '/LINE-1', nodeNumber: 10, x: 0, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/LINE-1', nodeNumber: 20, x: 2000, y: 0, z: 1000, pageNumber: 1, annotationId: 'a1' },
        // Parallel Line-2 with centerline 115mm away -> radii 50+50 = 100 -> 15mm gap (< 25mm threshold)
        { branchName: '/LINE-2', nodeNumber: 30, x: 0, y: 115, z: 1000, pageNumber: 1, annotationId: 'a2' },
        { branchName: '/LINE-2', nodeNumber: 40, x: 2000, y: 115, z: 1000, pageNumber: 1, annotationId: 'a2' },
      ],
      branchRows: [
        { branchName: '/LINE-1', nodeNumber: 10, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
        { branchName: '/LINE-2', nodeNumber: 30, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
      ],
      restraintRows: [],
      weightRows: [],
      dtxrRows: [],
    };

    const scene = buildVolumetricPipingScene(model);
    const audit = runSpatialClashAudit(scene.parts, { minClearanceMm: 25 });

    expect(audit.hardClashCount).toBe(0);
    expect(audit.clearanceViolationCount).toBe(1);
    expect(audit.minimumClearanceMm).toBeCloseTo(15, 1);
    expect(audit.clashes[0].severity).toBe('CLEARANCE_VIOLATION');
    expect(audit.clashes[0].surfaceClearanceMm).toBeCloseTo(15, 1);

    // Increasing clearance beyond gap -> violation remains; decreasing threshold to 10mm -> PASS
    const passAudit = runSpatialClashAudit(scene.parts, { minClearanceMm: 10 });
    expect(passAudit.hardClashCount).toBe(0);
    expect(passAudit.clearanceViolationCount).toBe(0);
  });

  it('computes segment distances accurately and audits arbitrary external extruded U3D meshes', () => {
    const seg = closestDistanceBetweenSegments3D(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 5, y: 3, z: 4 },
      { x: 5, y: 3, z: 10 },
    );
    expect(seg.distance).toBeCloseTo(5, 4);

    const meshA = extrudePolygonTo3D(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
      { depth: 50, meshId: 'StructBeamA' },
    );
    const meshB = extrudePolygonTo3D(
      [
        { x: 30, y: 30 },
        { x: 80, y: 30 },
        { x: 80, y: 80 },
        { x: 30, y: 80 },
      ],
      { depth: 50, meshId: 'EquipmentSkidB' },
    );

    const meshAudit = runSpatialClashAudit([
      { id: 'A', label: 'StructBeamA', kind: 'external_mesh', mesh: meshA },
      { id: 'B', label: 'EquipmentSkidB', kind: 'external_mesh', mesh: meshB },
    ]);
    expect(meshAudit.hardClashCount).toBe(1);
    expect(meshAudit.clashes[0].penetrationDepthMm).toBeCloseTo(20, 1);
  });
});
