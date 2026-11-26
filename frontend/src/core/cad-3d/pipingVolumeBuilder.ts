import type { FullXmlBuilderModel, PipelineBranchRow, PipelineCoordinateRow } from '../pipeline-geometry/types';
import type { CadExtrudedMesh3D, Point3D } from './types';
import { computeMeshMetrics } from './meshGeometryUtils';

export type PipingScenePartKind = 'pipe_segment' | 'toroid_elbow' | 'component_body' | 'support_shoe';

export interface PipingVolumeScenePart {
  id: string;
  kind: PipingScenePartKind;
  branchName: string;
  fromNode: number;
  toNode?: number;
  startPoint: Point3D;
  endPoint: Point3D;
  outerRadiusMm: number;
  innerRadiusMm: number;
  bendAngleDeg?: number;
  bendRadiusMm?: number;
  color: string;
  label: string;
  mesh: CadExtrudedMesh3D;
}

export interface PipingVolumeBuildOptions {
  radialSegments?: number;
  elbowArcSegments?: number;
  defaultBoreMm?: number;
  defaultWallThicknessMm?: number;
}

export interface PipingVolumeScene {
  parts: PipingVolumeScenePart[];
  totalPipeLengthMm: number;
  elbowCount: number;
  hollowSegmentCount: number;
  bounds: CadExtrudedMesh3D['bounds'];
  centroid: Point3D;
  totalVolumeMm3: number;
}

function sub(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Point3D, b: Point3D): Point3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec(a: Point3D, s: number): Point3D {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(a: Point3D): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Point3D): Point3D {
  const l = length(a);
  if (l <= 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function buildOrthonormalBasis(axis: Point3D): { u: Point3D; v: Point3D } {
  const ref: Point3D = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(axis, ref));
  const v = normalize(cross(axis, u));
  return { u, v };
}

/**
 * Generates a closed solid or true hollow annular pipe cylinder along [start, end].
 */
export function buildPipeCylinderMesh(
  id: string,
  start: Point3D,
  end: Point3D,
  outerRadius: number,
  innerRadius = 0,
  radialSegments = 16,
): CadExtrudedMesh3D {
  const segs = Math.max(6, Math.floor(radialSegments));
  const axisRaw = sub(end, start);
  const axisLen = length(axisRaw);
  const axis = axisLen > 1e-6 ? normalize(axisRaw) : { x: 1, y: 0, z: 0 };
  const safeEnd = axisLen > 1e-6 ? end : add(start, { x: 1, y: 0, z: 0 });
  const rOut = Math.max(0.5, outerRadius);
  const rIn = innerRadius > 0.25 && innerRadius < rOut - 0.1 ? innerRadius : 0;

  const { u, v } = buildOrthonormalBasis(axis);

  const verts: number[] = [];
  const norms: number[] = [];
  const indices: number[] = [];

  const pushVert = (p: Point3D, n: Point3D): number => {
    const idx = verts.length / 3;
    verts.push(p.x, p.y, p.z);
    norms.push(n.x, n.y, n.z);
    return idx;
  };

  // Outer wall rings (at start & safeEnd)
  const outerStart: number[] = [];
  const outerEnd: number[] = [];
  for (let i = 0; i < segs; i++) {
    const ang = (i / segs) * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const radialNormal = add(scaleVec(u, ca), scaleVec(v, sa));
    const offset = scaleVec(radialNormal, rOut);
    outerStart.push(pushVert(add(start, offset), radialNormal));
    outerEnd.push(pushVert(add(safeEnd, offset), radialNormal));
  }

  for (let i = 0; i < segs; i++) {
    const next = (i + 1) % segs;
    indices.push(outerStart[i], outerStart[next], outerEnd[next]);
    indices.push(outerStart[i], outerEnd[next], outerEnd[i]);
  }

  if (rIn > 0) {
    // True hollow inner bore wall + annular start & end caps
    const innerStart: number[] = [];
    const innerEnd: number[] = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const inwardNormal = scaleVec(add(scaleVec(u, ca), scaleVec(v, sa)), -1);
      const offset = scaleVec(add(scaleVec(u, ca), scaleVec(v, sa)), rIn);
      innerStart.push(pushVert(add(start, offset), inwardNormal));
      innerEnd.push(pushVert(add(safeEnd, offset), inwardNormal));
    }
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      indices.push(innerStart[i], innerEnd[next], innerStart[next]);
      indices.push(innerStart[i], innerEnd[i], innerEnd[next]);
    }

    // Annular caps at start (-axis) and safeEnd (+axis)
    const negAxis = scaleVec(axis, -1);
    const capOuterStart: number[] = [];
    const capInnerStart: number[] = [];
    const capOuterEnd: number[] = [];
    const capInnerEnd: number[] = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const dir = add(scaleVec(u, Math.cos(ang)), scaleVec(v, Math.sin(ang)));
      capOuterStart.push(pushVert(add(start, scaleVec(dir, rOut)), negAxis));
      capInnerStart.push(pushVert(add(start, scaleVec(dir, rIn)), negAxis));
      capOuterEnd.push(pushVert(add(safeEnd, scaleVec(dir, rOut)), axis));
      capInnerEnd.push(pushVert(add(safeEnd, scaleVec(dir, rIn)), axis));
    }
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      indices.push(capOuterStart[i], capInnerStart[next], capOuterStart[next]);
      indices.push(capOuterStart[i], capInnerStart[i], capInnerStart[next]);
      indices.push(capOuterEnd[i], capOuterEnd[next], capInnerEnd[next]);
      indices.push(capOuterEnd[i], capInnerEnd[next], capInnerEnd[i]);
    }
  } else {
    // Solid end caps
    const negAxis = scaleVec(axis, -1);
    const startCenter = pushVert(start, negAxis);
    const endCenter = pushVert(safeEnd, axis);
    const startRing: number[] = [];
    const endRing: number[] = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const offset = scaleVec(add(scaleVec(u, Math.cos(ang)), scaleVec(v, Math.sin(ang))), rOut);
      startRing.push(pushVert(add(start, offset), negAxis));
      endRing.push(pushVert(add(safeEnd, offset), axis));
    }
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      indices.push(startCenter, startRing[next], startRing[i]);
      indices.push(endCenter, endRing[i], endRing[next]);
    }
  }

  const vArr = new Float32Array(verts);
  const nArr = new Float32Array(norms);
  const iArr = new Uint32Array(indices);
  const metrics = computeMeshMetrics(vArr, iArr);

  return {
    id,
    vertices: vArr,
    normals: nArr,
    indices: iArr,
    triangleCount: Math.floor(iArr.length / 3),
    vertexCount: Math.floor(vArr.length / 3),
    bounds: metrics.bounds,
    centroid: metrics.centroid,
    volume: metrics.volume,
    surfaceArea: metrics.surfaceArea,
  };
}

/**
 * Generates a smooth swept toroid pipe elbow mesh connecting tangentIn -> tangentOut
 * along a circular arc in the plane spanned by (uIn, uOut).
 */
export function buildToroidElbowMesh(
  id: string,
  tangentIn: Point3D,
  uIn: Point3D,
  uOut: Point3D,
  bendRadius: number,
  bendAngleRad: number,
  outerRadius: number,
  innerRadius = 0,
  radialSegments = 16,
  arcSegments = 10,
): CadExtrudedMesh3D {
  const segs = Math.max(6, Math.floor(radialSegments));
  const steps = Math.max(3, Math.floor(arcSegments));
  const rOut = Math.max(0.5, outerRadius);
  const rIn = innerRadius > 0.25 && innerRadius < rOut - 0.1 ? innerRadius : 0;

  const binormal = normalize(cross(uIn, uOut));
  const radialInward = normalize(cross(binormal, uIn));
  const torusCenter = add(tangentIn, scaleVec(radialInward, bendRadius));

  const verts: number[] = [];
  const norms: number[] = [];
  const indices: number[] = [];

  const pushVert = (p: Point3D, n: Point3D): number => {
    const idx = verts.length / 3;
    verts.push(p.x, p.y, p.z);
    norms.push(n.x, n.y, n.z);
    return idx;
  };

  const buildArcRings = (radius: number, invertNormal: boolean): number[][] => {
    const rings: number[][] = [];
    for (let s = 0; s <= steps; s++) {
      const phi = (s / steps) * bendAngleRad;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      // Outward from torus center toward arc centerline
      const radialOut = add(scaleVec(radialInward, -cosP), scaleVec(uIn, sinP));
      const centerOnArc = add(torusCenter, scaleVec(radialOut, bendRadius));
      const ring: number[] = [];
      for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        const tubeNormal = normalize(add(scaleVec(radialOut, ct), scaleVec(binormal, st)));
        const pos = add(centerOnArc, scaleVec(tubeNormal, radius));
        ring.push(pushVert(pos, invertNormal ? scaleVec(tubeNormal, -1) : tubeNormal));
      }
      rings.push(ring);
    }
    return rings;
  };

  const outerRings = buildArcRings(rOut, false);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      indices.push(outerRings[s][i], outerRings[s][next], outerRings[s + 1][next]);
      indices.push(outerRings[s][i], outerRings[s + 1][next], outerRings[s + 1][i]);
    }
  }

  if (rIn > 0) {
    const innerRings = buildArcRings(rIn, true);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < segs; i++) {
        const next = (i + 1) % segs;
        indices.push(innerRings[s][i], innerRings[s + 1][next], innerRings[s][next]);
        indices.push(innerRings[s][i], innerRings[s + 1][i], innerRings[s + 1][next]);
      }
    }
  }

  const vArr = new Float32Array(verts);
  const nArr = new Float32Array(norms);
  const iArr = new Uint32Array(indices);
  const metrics = computeMeshMetrics(vArr, iArr);

  return {
    id,
    vertices: vArr,
    normals: nArr,
    indices: iArr,
    triangleCount: Math.floor(iArr.length / 3),
    vertexCount: Math.floor(vArr.length / 3),
    bounds: metrics.bounds,
    centroid: metrics.centroid,
    volume: metrics.volume,
    surfaceArea: metrics.surfaceArea,
  };
}

function buildBranchSpecLookup(
  branchRows: PipelineBranchRow[],
): Map<string, PipelineBranchRow[]> {
  const byBranch = new Map<string, PipelineBranchRow[]>();
  for (const row of branchRows) {
    const arr = byBranch.get(row.branchName) ?? [];
    arr.push(row);
    byBranch.set(row.branchName, arr);
  }
  for (const arr of byBranch.values()) {
    arr.sort((a, b) => a.nodeNumber - b.nodeNumber);
  }
  return byBranch;
}

function resolvePipeSpec(
  byBranch: Map<string, PipelineBranchRow[]>,
  branchName: string,
  nodeNumber: number,
  defaultBoreMm: number,
  defaultWallMm: number,
): { boreMm: number; wallThickness: number } {
  const specs = byBranch.get(branchName);
  if (!specs || specs.length === 0) {
    return { boreMm: defaultBoreMm, wallThickness: defaultWallMm };
  }
  let active = specs[0];
  for (const s of specs) {
    if (s.nodeNumber <= nodeNumber) {
      active = s;
    } else {
      break;
    }
  }
  return {
    boreMm: active.boreMm > 0 ? active.boreMm : defaultBoreMm,
    wallThickness: active.wallThickness >= 0 ? active.wallThickness : defaultWallMm,
  };
}

const BRANCH_PALETTE = ['#0ea5e9', '#3b82f6', '#14b8a6', '#8b5cf6', '#f97316'] as const;

/**
 * Transforms a CAESAR/XML Builder piping centerline model into volumetric 3D cylinders
 * (using OD & wall thickness), swept toroid elbows at bends, and support/component bodies.
 */
export function buildVolumetricPipingScene(
  model: FullXmlBuilderModel,
  options: PipingVolumeBuildOptions = {},
): PipingVolumeScene {
  const radialSegments = options.radialSegments ?? 14;
  const elbowArcSegments = options.elbowArcSegments ?? 8;
  const defaultBoreMm = options.defaultBoreMm ?? 114.3;
  const defaultWallMm = options.defaultWallThicknessMm ?? 6.02;

  const byBranchNodes = new Map<string, PipelineCoordinateRow[]>();
  for (const row of model.coordinateRows) {
    const list = byBranchNodes.get(row.branchName) ?? [];
    list.push(row);
    byBranchNodes.set(row.branchName, list);
  }

  const branchSpecs = buildBranchSpecLookup(model.branchRows);
  const parts: PipingVolumeScenePart[] = [];
  let totalPipeLengthMm = 0;
  let elbowCount = 0;
  let hollowSegmentCount = 0;

  let branchIdx = 0;
  for (const [branchName, nodes] of byBranchNodes.entries()) {
    const color = BRANCH_PALETTE[branchIdx % BRANCH_PALETTE.length];
    branchIdx++;
    if (nodes.length < 2) continue;

    // Precompute elbow tangent setback per interior vertex
    interface ElbowMeta {
      tangentIn: Point3D;
      tangentOut: Point3D;
      setback: number;
      uIn: Point3D;
      uOut: Point3D;
      angleRad: number;
      bendRadius: number;
      outerRadius: number;
      innerRadius: number;
    }

    const elbows = new Map<number, ElbowMeta>();
    for (let i = 1; i < nodes.length - 1; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const next = nodes[i + 1];

      const vInRaw = sub(curr, prev);
      const vOutRaw = sub(next, curr);
      const lenIn = length(vInRaw);
      const lenOut = length(vOutRaw);
      if (lenIn < 1e-3 || lenOut < 1e-3) continue;

      const uIn = scaleVec(vInRaw, 1 / lenIn);
      const uOut = scaleVec(vOutRaw, 1 / lenOut);
      const cosTheta = Math.max(-1, Math.min(1, dot(uIn, uOut)));
      const angleRad = Math.acos(cosTheta);
      const angleDeg = (angleRad * 180) / Math.PI;

      // Swept bend if between 12 deg and 168 deg
      if (angleDeg >= 12 && angleDeg <= 168) {
        const spec = resolvePipeSpec(
          branchSpecs,
          branchName,
          curr.nodeNumber,
          defaultBoreMm,
          defaultWallMm,
        );
        const outerRadius = spec.boreMm / 2;
        const innerRadius =
          spec.wallThickness > 0 && spec.wallThickness < outerRadius - 0.1
            ? outerRadius - spec.wallThickness
            : 0;
        const idealR = spec.boreMm * 1.5; // ASME B16.9 Long-Radius 1.5D elbow
        const tanHalf = Math.tan(angleRad / 2);
        const maxSetback = Math.min(lenIn, lenOut) * 0.42;
        const setback = Math.min(maxSetback, idealR * tanHalf);
        const effectiveR = tanHalf > 1e-6 ? setback / tanHalf : idealR;

        if (setback > outerRadius * 0.15) {
          elbows.set(i, {
            tangentIn: sub(curr, scaleVec(uIn, setback)),
            tangentOut: add(curr, scaleVec(uOut, setback)),
            setback,
            uIn,
            uOut,
            angleRad,
            bendRadius: effectiveR,
            outerRadius,
            innerRadius,
          });
        }
      }
    }

    // Build straight cylinder segments trimmed cleanly to elbow tangent points
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const startPt = elbows.get(i)?.tangentOut ?? { x: a.x, y: a.y, z: a.z };
      const endPt = elbows.get(i + 1)?.tangentIn ?? { x: b.x, y: b.y, z: b.z };
      const segLen = length(sub(endPt, startPt));
      if (segLen < 0.5) continue;

      const spec = resolvePipeSpec(
        branchSpecs,
        branchName,
        a.nodeNumber,
        defaultBoreMm,
        defaultWallMm,
      );
      const outerRadius = spec.boreMm / 2;
      const innerRadius =
        spec.wallThickness > 0 && spec.wallThickness < outerRadius - 0.1
          ? outerRadius - spec.wallThickness
          : 0;

      if (innerRadius > 0) hollowSegmentCount++;
      totalPipeLengthMm += segLen;

      const id = `pipe_${branchName}_${a.nodeNumber}_${b.nodeNumber}`;
      const mesh = buildPipeCylinderMesh(
        id,
        startPt,
        endPt,
        outerRadius,
        innerRadius,
        radialSegments,
      );

      parts.push({
        id,
        kind: 'pipe_segment',
        branchName,
        fromNode: a.nodeNumber,
        toNode: b.nodeNumber,
        startPoint: startPt,
        endPoint: endPt,
        outerRadiusMm: outerRadius,
        innerRadiusMm: innerRadius,
        color,
        label: `Pipe ${branchName} (${a.nodeNumber}->${b.nodeNumber}) OD ${Math.round(spec.boreMm)}mm`,
        mesh,
      });
    }

    // Build toroid elbows at corners
    for (const [nodeIdx, elbow] of elbows.entries()) {
      const node = nodes[nodeIdx];
      const angleDeg = Math.round((elbow.angleRad * 180) / Math.PI);
      const id = `elbow_${branchName}_${node.nodeNumber}`;
      const mesh = buildToroidElbowMesh(
        id,
        elbow.tangentIn,
        elbow.uIn,
        elbow.uOut,
        elbow.bendRadius,
        elbow.angleRad,
        elbow.outerRadius,
        elbow.innerRadius,
        radialSegments,
        elbowArcSegments,
      );
      elbowCount++;
      totalPipeLengthMm += elbow.bendRadius * elbow.angleRad;

      parts.push({
        id,
        kind: 'toroid_elbow',
        branchName,
        fromNode: node.nodeNumber,
        startPoint: elbow.tangentIn,
        endPoint: elbow.tangentOut,
        outerRadiusMm: elbow.outerRadius,
        innerRadiusMm: elbow.innerRadius,
        bendAngleDeg: angleDeg,
        bendRadiusMm: Math.round(elbow.bendRadius * 10) / 10,
        color: '#22d3ee',
        label: `${angleDeg}° LR Elbow @ Node ${node.nodeNumber} (R=${Math.round(elbow.bendRadius)}mm)`,
        mesh,
      });
    }
  }

  // Add component sleeves (valves / flanges / rigid components) and support shoes
  const coordByNode = new Map<number, PipelineCoordinateRow>();
  for (const row of model.coordinateRows) {
    coordByNode.set(row.nodeNumber, row);
  }

  for (const w of model.weightRows) {
    const node = coordByNode.get(w.nodeNumber);
    if (!node) continue;
    const spec = resolvePipeSpec(
      branchSpecs,
      w.branchName,
      w.nodeNumber,
      defaultBoreMm,
      defaultWallMm,
    );
    const radius = spec.boreMm * 0.82;
    const halfLen = Math.max(40, spec.boreMm * 0.65);
    const startPt: Point3D = { x: node.x - halfLen, y: node.y, z: node.z };
    const endPt: Point3D = { x: node.x + halfLen, y: node.y, z: node.z };
    const id = `comp_${w.componentType}_${w.nodeNumber}`;
    const mesh = buildPipeCylinderMesh(id, startPt, endPt, radius, 0, 12);
    parts.push({
      id,
      kind: 'component_body',
      branchName: w.branchName,
      fromNode: w.nodeNumber,
      startPoint: startPt,
      endPoint: endPt,
      outerRadiusMm: radius,
      innerRadiusMm: 0,
      color: '#a855f7',
      label: `${w.componentType} @ Node ${w.nodeNumber} (${w.weight}kg)`,
      mesh,
    });
  }

  for (const r of model.restraintRows) {
    const node = coordByNode.get(r.nodeNumber);
    if (!node) continue;
    const spec = resolvePipeSpec(
      branchSpecs,
      r.branchName,
      r.nodeNumber,
      defaultBoreMm,
      defaultWallMm,
    );
    const baseRadius = Math.max(25, spec.boreMm * 0.35);
    const drop = Math.max(80, spec.boreMm * 1.1);
    const startPt: Point3D = { x: node.x, y: node.y, z: node.z - spec.boreMm * 0.5 };
    const endPt: Point3D = { x: node.x, y: node.y, z: node.z - spec.boreMm * 0.5 - drop };
    const id = `supp_${r.restraintType}_${r.nodeNumber}`;
    const mesh = buildPipeCylinderMesh(id, startPt, endPt, baseRadius, 0, 8);
    parts.push({
      id,
      kind: 'support_shoe',
      branchName: r.branchName,
      fromNode: r.nodeNumber,
      startPoint: startPt,
      endPoint: endPt,
      outerRadiusMm: baseRadius,
      innerRadiusMm: 0,
      color: '#10b981',
      label: `${r.restraintType} Support @ Node ${r.nodeNumber}`,
      mesh,
    });
  }

  // Global scene bounds & centroid
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let totalVolumeMm3 = 0;

  for (const part of parts) {
    const b = part.mesh.bounds;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
    totalVolumeMm3 += part.mesh.volume;
  }

  if (parts.length === 0) {
    minX = 0;
    minY = 0;
    minZ = 0;
    maxX = 0;
    maxY = 0;
    maxZ = 0;
  }

  return {
    parts,
    totalPipeLengthMm: Math.round(totalPipeLengthMm * 100) / 100,
    elbowCount,
    hollowSegmentCount,
    bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    centroid: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    },
    totalVolumeMm3: Math.round(totalVolumeMm3 * 100) / 100,
  };
}
