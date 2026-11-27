import type { Bounds3D, CadExtrudedMesh3D, Point3D } from './types';
import type { PipingScenePartKind, PipingVolumeScenePart } from './pipingVolumeBuilder';

export type ClashSeverity = 'HARD_CLASH' | 'CLEARANCE_VIOLATION';

export interface ClashIssue {
  id: string;
  severity: ClashSeverity;
  partAId: string;
  partALabel: string;
  partBId: string;
  partBLabel: string;
  surfaceClearanceMm: number;
  penetrationDepthMm: number;
  clashPoint: Point3D;
}

export interface ClashAuditOptions {
  minClearanceMm?: number;
  cellSizeMm?: number;
  excludeConnectedSameBranchNeighbors?: boolean;
}

export interface ClashAuditReport {
  totalObjectsChecked: number;
  candidatePairsTested: number;
  hardClashCount: number;
  clearanceViolationCount: number;
  minimumClearanceMm: number | null;
  minClearanceThresholdMm: number;
  cellSizeMm: number;
  durationMs: number;
  clashes: ClashIssue[];
}

export interface ClashAuditableVolume {
  id: string;
  label: string;
  kind: PipingScenePartKind | 'external_mesh';
  branchName?: string;
  fromNode?: number;
  toNode?: number;
  startPoint?: Point3D;
  endPoint?: Point3D;
  outerRadiusMm?: number;
  mesh: CadExtrudedMesh3D;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Computes exact minimum Euclidean distance and closest pair of points between
 * two 3D line segments [p1, q1] and [p2, q2].
 */
export function closestDistanceBetweenSegments3D(
  p1: Point3D,
  q1: Point3D,
  p2: Point3D,
  q2: Point3D,
): { distance: number; pointA: Point3D; pointB: Point3D } {
  const d1x = q1.x - p1.x;
  const d1y = q1.y - p1.y;
  const d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x;
  const d2y = q2.y - p2.y;
  const d2z = q2.z - p2.z;
  const rx = p1.x - p2.x;
  const ry = p1.y - p2.y;
  const rz = p1.z - p2.z;

  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;

  const EPS = 1e-8;
  let s = 0;
  let t = 0;

  if (a <= EPS && e <= EPS) {
    return {
      distance: Math.hypot(rx, ry, rz),
      pointA: { ...p1 },
      pointB: { ...p2 },
    };
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  const pointA: Point3D = {
    x: p1.x + d1x * s,
    y: p1.y + d1y * s,
    z: p1.z + d1z * s,
  };
  const pointB: Point3D = {
    x: p2.x + d2x * t,
    y: p2.y + d2y * t,
    z: p2.z + d2z * t,
  };
  return {
    distance: Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y, pointA.z - pointB.z),
    pointA,
    pointB,
  };
}

function boundsDistance(a: Bounds3D, b: Bounds3D): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const dz = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(dx, dy, dz);
}

function getNodesForPart(p: ClashAuditableVolume): number[] {
  const nodes: number[] = [];
  if (p.fromNode !== undefined) nodes.push(p.fromNode);
  if (p.toNode !== undefined) nodes.push(p.toNode);
  return nodes;
}

function areConnectedSameBranchNeighbors(
  a: ClashAuditableVolume,
  b: ClashAuditableVolume,
): boolean {
  if (!a.branchName || !b.branchName || a.branchName !== b.branchName) {
    return false;
  }
  const nodesA = getNodesForPart(a);
  const nodesB = getNodesForPart(b);
  for (const na of nodesA) {
    if (nodesB.includes(na)) return true;
  }
  return false;
}

function computePairClearance(
  a: ClashAuditableVolume,
  b: ClashAuditableVolume,
): { surfaceClearanceMm: number; clashPoint: Point3D } {
  if (
    a.startPoint &&
    a.endPoint &&
    b.startPoint &&
    b.endPoint &&
    a.outerRadiusMm !== undefined &&
    b.outerRadiusMm !== undefined
  ) {
    const seg = closestDistanceBetweenSegments3D(
      a.startPoint,
      a.endPoint,
      b.startPoint,
      b.endPoint,
    );
    const surfaceClearanceMm = seg.distance - (a.outerRadiusMm + b.outerRadiusMm);
    return {
      surfaceClearanceMm,
      clashPoint: {
        x: (seg.pointA.x + seg.pointB.x) / 2,
        y: (seg.pointA.y + seg.pointB.y) / 2,
        z: (seg.pointA.z + seg.pointB.z) / 2,
      },
    };
  }

  // Fallback for arbitrary imported U3D / extruded B-Rep bounding volumes
  const boxGap = boundsDistance(a.mesh.bounds, b.mesh.bounds);
  if (boxGap > 0) {
    return {
      surfaceClearanceMm: boxGap,
      clashPoint: {
        x: (a.mesh.centroid.x + b.mesh.centroid.x) / 2,
        y: (a.mesh.centroid.y + b.mesh.centroid.y) / 2,
        z: (a.mesh.centroid.z + b.mesh.centroid.z) / 2,
      },
    };
  }

  // Compute negative overlap depth along minimum separating box axis
  const overlapX = Math.min(a.mesh.bounds.maxX, b.mesh.bounds.maxX) - Math.max(a.mesh.bounds.minX, b.mesh.bounds.minX);
  const overlapY = Math.min(a.mesh.bounds.maxY, b.mesh.bounds.maxY) - Math.max(a.mesh.bounds.minY, b.mesh.bounds.minY);
  const overlapZ = Math.min(a.mesh.bounds.maxZ, b.mesh.bounds.maxZ) - Math.max(a.mesh.bounds.minZ, b.mesh.bounds.minZ);
  const minPenetration = Math.max(0, Math.min(overlapX, overlapY, overlapZ));

  return {
    surfaceClearanceMm: -minPenetration,
    clashPoint: {
      x: (Math.max(a.mesh.bounds.minX, b.mesh.bounds.minX) + Math.min(a.mesh.bounds.maxX, b.mesh.bounds.maxX)) / 2,
      y: (Math.max(a.mesh.bounds.minY, b.mesh.bounds.minY) + Math.min(a.mesh.bounds.maxY, b.mesh.bounds.maxY)) / 2,
      z: (Math.max(a.mesh.bounds.minZ, b.mesh.bounds.minZ) + Math.min(a.mesh.bounds.maxZ, b.mesh.bounds.maxZ)) / 2,
    },
  };
}

/**
 * Runs a 3D Uniform Spatial Hash Grid clash & clearance audit across piping
 * parts and/or extracted 3D PDF meshes.
 */
export function runSpatialClashAudit(
  items: ReadonlyArray<PipingVolumeScenePart | ClashAuditableVolume>,
  options: ClashAuditOptions = {},
): ClashAuditReport {
  const start = performance.now();
  const minClearanceThresholdMm = Math.max(0, options.minClearanceMm ?? 25);
  const excludeNeighbors = options.excludeConnectedSameBranchNeighbors ?? true;

  // Estimate reasonable spatial hash cell size if omitted
  let avgSpan = 0;
  for (const item of items) {
    const b = item.mesh.bounds;
    avgSpan += Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  }
  const derivedCellSize =
    items.length > 0 ? Math.max(150, Math.min(2000, Math.round((avgSpan / items.length) * 0.75))) : 250;
  const cellSizeMm = Math.max(20, options.cellSizeMm ?? derivedCellSize);

  // Build spatial hash map indexing each object's clearance-inflated AABB
  const grid = new Map<string, number[]>();
  const margin = minClearanceThresholdMm + 1;

  for (let idx = 0; idx < items.length; idx++) {
    const b = items[idx].mesh.bounds;
    const minCellX = Math.floor((b.minX - margin) / cellSizeMm);
    const maxCellX = Math.floor((b.maxX + margin) / cellSizeMm);
    const minCellY = Math.floor((b.minY - margin) / cellSizeMm);
    const maxCellY = Math.floor((b.maxY + margin) / cellSizeMm);
    const minCellZ = Math.floor((b.minZ - margin) / cellSizeMm);
    const maxCellZ = Math.floor((b.maxZ + margin) / cellSizeMm);

    // Guard against huge single objects blowing up grid iteration count
    const cxSpan = Math.min(24, maxCellX - minCellX);
    const cySpan = Math.min(24, maxCellY - minCellY);
    const czSpan = Math.min(24, maxCellZ - minCellZ);

    for (let ix = minCellX; ix <= minCellX + cxSpan; ix++) {
      for (let iy = minCellY; iy <= minCellY + cySpan; iy++) {
        for (let iz = minCellZ; iz <= minCellZ + czSpan; iz++) {
          const key = `${ix},${iy},${iz}`;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(idx);
        }
      }
    }
  }

  const testedPairs = new Set<string>();
  const clashes: ClashIssue[] = [];
  let hardClashCount = 0;
  let clearanceViolationCount = 0;
  let minimumClearanceMm: number | null = null;
  let candidatePairsTested = 0;

  for (const bucket of grid.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const aIdx = Math.min(bucket[i], bucket[j]);
        const bIdx = Math.max(bucket[i], bucket[j]);
        const pairKey = `${aIdx}:${bIdx}`;
        if (testedPairs.has(pairKey)) continue;
        testedPairs.add(pairKey);

        const partA = items[aIdx];
        const partB = items[bIdx];

        if (excludeNeighbors && areConnectedSameBranchNeighbors(partA, partB)) {
          continue;
        }

        // Broadphase inflated AABB rejection
        if (boundsDistance(partA.mesh.bounds, partB.mesh.bounds) > margin) {
          continue;
        }

        candidatePairsTested++;
        const { surfaceClearanceMm, clashPoint } = computePairClearance(partA, partB);
        const roundedClearance = Math.round(surfaceClearanceMm * 100) / 100;

        if (minimumClearanceMm === null || roundedClearance < minimumClearanceMm) {
          minimumClearanceMm = roundedClearance;
        }

        if (surfaceClearanceMm < -1e-2) {
          hardClashCount++;
          clashes.push({
            id: `clash_${aIdx}_${bIdx}`,
            severity: 'HARD_CLASH',
            partAId: partA.id,
            partALabel: partA.label,
            partBId: partB.id,
            partBLabel: partB.label,
            surfaceClearanceMm: roundedClearance,
            penetrationDepthMm: Math.round(Math.abs(surfaceClearanceMm) * 100) / 100,
            clashPoint,
          });
        } else if (surfaceClearanceMm < minClearanceThresholdMm) {
          clearanceViolationCount++;
          clashes.push({
            id: `clash_${aIdx}_${bIdx}`,
            severity: 'CLEARANCE_VIOLATION',
            partAId: partA.id,
            partALabel: partA.label,
            partBId: partB.id,
            partBLabel: partB.label,
            surfaceClearanceMm: roundedClearance,
            penetrationDepthMm: 0,
            clashPoint,
          });
        }
      }
    }
  }

  clashes.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'HARD_CLASH' ? -1 : 1;
    }
    return a.surfaceClearanceMm - b.surfaceClearanceMm;
  });

  const durationMs = Math.round((performance.now() - start) * 100) / 100;

  return {
    totalObjectsChecked: items.length,
    candidatePairsTested,
    hardClashCount,
    clearanceViolationCount,
    minimumClearanceMm,
    minClearanceThresholdMm,
    cellSizeMm,
    durationMs,
    clashes,
  };
}
