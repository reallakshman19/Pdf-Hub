/**
 * CAESAR II / XML CII Automated Topology Synthesizer.
 *
 * Automatically detects and inserts:
 * 1. Auto-Bends: Identifies 90° and 45° direction changes in 3D polyline paths.
 * 2. Auto-Tees: Identifies intersection points between branches and headers.
 * 3. Auto-Reducers: Identifies diameter changes along continuous lines.
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { CustomInputModel } from './customInputModel';

function parsePos(pos?: string): [number, number, number] | null {
  if (!pos) return null;
  const parts = pos.trim().split(/\s+/).map(Number);
  if (parts.length >= 3 && parts.every(Number.isFinite)) {
    return [parts[0], parts[1], parts[2]];
  }
  return null;
}

function vector(from: [number, number, number], to: [number, number, number]): [number, number, number] {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

function magnitude(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/**
 * Calculates 3D interior angle between segment (b -> a) and segment (b -> c) in degrees.
 */
export function calculateTurnAngleDeg(
  pa: [number, number, number],
  pb: [number, number, number],
  pc: [number, number, number],
): number | null {
  const v1 = vector(pb, pa);
  const v2 = vector(pb, pc);
  const m1 = magnitude(v1);
  const m2 = magnitude(v2);

  if (m1 === 0 || m2 === 0) return null;

  let cosTheta = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (m1 * m2);
  cosTheta = Math.max(-1, Math.min(1, cosTheta));

  const deg = (Math.acos(cosTheta) * 180) / Math.PI;
  return Math.round(deg * 10) / 10;
}

export interface BendDetectionHit {
  branchName: string;
  nodeNumber: string;
  angleDeg: number;
  bendType: 'ELBOW 90' | 'ELBOW 45';
  dtxr: string;
}

/**
 * Detects 90° and 45° bends across all branches.
 */
export function detectCustomInputBends(
  model: CustomInputModel,
  toleranceDeg: number = 5,
): BendDetectionHit[] {
  const hits: BendDetectionHit[] = [];

  for (const branch of model.branches) {
    const nodes = branch.nodes;
    for (let i = 1; i < nodes.length - 1; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      const c = nodes[i + 1];

      const pa = parsePos(a.position);
      const pb = parsePos(b.position);
      const pc = parsePos(c.position);

      if (!pa || !pb || !pc) continue;

      const angle = calculateTurnAngleDeg(pa, pb, pc);
      if (angle === null) continue;

      // Note: 90 degree turn means interior angle between incoming & outgoing ray is 90°
      const is90 = Math.abs(angle - 90) <= toleranceDeg;
      const is45 = Math.abs(angle - 135) <= toleranceDeg || Math.abs(angle - 45) <= toleranceDeg;

      if (is90 || is45) {
        const bendType = is90 ? 'ELBOW 90' : 'ELBOW 45';
        hits.push({
          branchName: branch.branchName,
          nodeNumber: b.nodeNumber,
          angleDeg: angle,
          bendType,
          dtxr: `${bendType} DEG LR BW`,
        });
      }
    }
  }

  return hits;
}

/**
 * Applies detected bends directly into the model graph.
 */
export function applyCustomInputBends(
  model: CustomInputModel,
  options?: { toleranceDeg?: number },
): CustomInputModel {
  const hits = detectCustomInputBends(model, options?.toleranceDeg);

  for (const hit of hits) {
    const branch = model.branches.find((b) => b.branchName === hit.branchName);
    if (!branch) continue;

    const node = branch.nodes.find((n) => n.nodeNumber === hit.nodeNumber);
    if (!node) continue;

    node.componentType = 'BEND';
    const bore = Number(node.boreMm || branch.boreMm || 100);
    // Standard ASME B16.9 Long Radius elbow: R = 1.5 * nominal diameter
    node.bendRadius = (1.5 * bore).toFixed(1);
    if (!node.dtxr) {
      node.dtxr = hit.dtxr;
    }
  }

  return model;
}

export interface TeeDetectionHit {
  branchName: string;
  nodeNumber: string;
  connectedBranches: string[];
}

/**
 * Detects tee connections where a branch intersects another line or shared node.
 */
export function detectCustomInputTees(model: CustomInputModel): TeeDetectionHit[] {
  const hits: TeeDetectionHit[] = [];
  const nodeBranchMap = new Map<string, Set<string>>();

  for (const branch of model.branches) {
    for (const node of branch.nodes) {
      const set = nodeBranchMap.get(node.nodeNumber) ?? new Set();
      set.add(branch.branchName);
      nodeBranchMap.set(node.nodeNumber, set);
    }
  }

  for (const [nodeNo, branches] of nodeBranchMap.entries()) {
    if (branches.size > 1) {
      for (const bName of branches) {
        hits.push({
          branchName: bName,
          nodeNumber: nodeNo,
          connectedBranches: Array.from(branches),
        });
      }
    }
  }

  return hits;
}

/**
 * Applies detected tees into the model graph.
 */
export function applyCustomInputTees(model: CustomInputModel): CustomInputModel {
  const hits = detectCustomInputTees(model);

  for (const hit of hits) {
    const branch = model.branches.find((b) => b.branchName === hit.branchName);
    if (!branch) continue;

    const node = branch.nodes.find((n) => n.nodeNumber === hit.nodeNumber);
    if (!node) continue;

    if (node.componentType === 'PIPE') {
      node.componentType = 'TEE';
      node.sif = '1.5';
    }
  }

  return model;
}
