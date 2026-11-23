/**
 * CAESAR II / XML CII Custom Input Model Graph.
 *
 * Builds the structural pipeline node & branch hierarchy from the 5 XML Builder tables.
 * Ported and optimized from reallakshman19/XML_Compare_Utilities/converters/xml-cii2019-core/custom-input-model.js
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { FullXmlBuilderModel } from '../types';

export interface ModelRestraint {
  type: string;
  direction?: string;
  gap?: string;
  stiffness?: string;
  friction?: string;
}

export interface ModelNode {
  nodeNumber: string;
  nodeName?: string;
  branchName: string;
  endpoint?: string;
  rigid?: string;
  componentType: string;
  weight?: string;
  componentRefNo?: string;
  outsideDiameter?: string;
  wallThickness?: string;
  corrosionAllowance?: string;
  insulationThickness?: string;
  position?: string; // "X Y Z"
  bendRadius?: string;
  sif?: string;
  pipingClass?: string;
  rating?: string;
  boreMm?: string;
  elementLengthMm?: string;
  materialName?: string;
  materialCode?: string;
  dtxr?: string;
  restraints?: ModelRestraint[];
}

export interface ModelBranch {
  branchName: string;
  lineKey?: string;
  p1?: string;
  hydroPressure?: string;
  t1?: string;
  t2?: string;
  t3?: string;
  fluidDensity?: string;
  boreMm?: string;
  wallThickness?: string;
  pipingClass?: string;
  rating?: string;
  materialName?: string;
  materialCode?: string;
  nodes: ModelNode[];
}

export interface CustomInputModel {
  schema: 'xml-cii-2019-custom-input';
  branches: ModelBranch[];
}

function trim(v: unknown): string {
  return String(v ?? '').trim();
}

function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) {
    h = (h << 5) - h + ch.charCodeAt(0);
    h |= 0;
  }
  return h;
}

/**
 * Builds the hierarchical piping stress model from raw table rows.
 */
export function buildCustomInputModel(input: Partial<FullXmlBuilderModel>): CustomInputModel {
  const branchMap = new Map<string, ModelBranch & { _nodeMap: Map<string, ModelNode> }>();

  const ensureBranch = (name: string): ModelBranch & { _nodeMap: Map<string, ModelNode> } => {
    const key = trim(name) || '/CUSTOM-UNNAMED/B1';
    if (!branchMap.has(key)) {
      branchMap.set(key, {
        branchName: key,
        lineKey: '1',
        nodes: [],
        _nodeMap: new Map<string, ModelNode>(),
      });
    }
    return branchMap.get(key)!;
  };

  const ensureNode = (
    branch: ModelBranch & { _nodeMap: Map<string, ModelNode> },
    nodeNo: string | number,
    componentType: string = 'PIPE',
  ): ModelNode => {
    const no = trim(nodeNo);
    if (!branch._nodeMap.has(no)) {
      const node: ModelNode = {
        nodeNumber: no,
        nodeName: no,
        branchName: branch.branchName,
        endpoint: '1',
        rigid: '0',
        componentType,
        weight: '0',
        componentRefNo: `CUSTOM/${Math.abs(hashStr(branch.branchName))}/${no}/${componentType}`,
        restraints: [],
      };
      branch._nodeMap.set(no, node);
      branch.nodes.push(node);
    }
    return branch._nodeMap.get(no)!;
  };

  // 1. Ingest Branch Rows
  for (const row of input.branchRows || []) {
    const b = ensureBranch(row.branchName);
    if (row.boreMm) b.boreMm = trim(row.boreMm);
    if (row.wallThickness) b.wallThickness = trim(row.wallThickness);
    if (row.p1) b.p1 = trim(row.p1);
    if (row.t1) b.t1 = trim(row.t1);
    if (row.t2) b.t2 = trim(row.t2);
    if (row.t3) b.t3 = trim(row.t3);
    if (row.fluidDensity) b.fluidDensity = trim(row.fluidDensity);
  }

  // 2. Ingest Coordinate Rows
  for (const row of input.coordinateRows || []) {
    const b = ensureBranch(row.branchName);
    const node = ensureNode(b, row.nodeNumber);
    node.position = `${row.x} ${row.y} ${row.z}`;
    if (typeof row.lengthToNextMm === 'number') {
      node.elementLengthMm = row.lengthToNextMm.toFixed(3);
    }
  }

  // 3. Ingest Restraint Rows
  for (const row of input.restraintRows || []) {
    const b = ensureBranch(row.branchName);
    const node = ensureNode(b, row.nodeNumber);
    if (row.nodeName) node.nodeName = trim(row.nodeName);
    node.restraints = node.restraints || [];
    node.restraints.push({
      type: trim(row.restraintType),
      direction: trim(row.direction),
      gap: trim(row.gap),
      stiffness: trim(row.stiffness),
      friction: trim(row.friction),
    });
  }

  // 4. Ingest Weight Rows (Valves & Components)
  for (const row of input.weightRows || []) {
    const b = ensureBranch(row.branchName);
    const node = ensureNode(b, row.nodeNumber, row.componentType || 'VALVE');
    node.componentType = trim(row.componentType || 'VALVE');
    node.rigid = row.rigid ? '1' : '0';
    node.weight = trim(row.weight);
    if (row.componentRefNo) node.componentRefNo = trim(row.componentRefNo);
    if (row.endpoint) node.endpoint = trim(row.endpoint);
  }

  // 5. Ingest DTXR Rows (Displacements)
  for (const row of input.dtxrRows || []) {
    const b = ensureBranch(row.branchName);
    const node = ensureNode(b, row.nodeNumber);
    node.dtxr = trim(row.dtxr);
  }

  // Calculate Element Lengths for consecutive nodes if not yet populated
  for (const b of branchMap.values()) {
    for (let i = 0; i < b.nodes.length; i++) {
      const cur = b.nodes[i];
      if (!cur.boreMm && b.boreMm) cur.boreMm = b.boreMm;
      if (!cur.wallThickness && b.wallThickness) cur.wallThickness = b.wallThickness;

      if (!cur.elementLengthMm && i < b.nodes.length - 1) {
        const next = b.nodes[i + 1];
        if (cur.position && next.position) {
          const p1 = cur.position.split(' ').map(Number);
          const p2 = next.position.split(' ').map(Number);
          if (p1.length >= 3 && p2.length >= 3) {
            const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
            cur.elementLengthMm = dist.toFixed(3);
          }
        }
      }
    }
  }

  const branches: ModelBranch[] = Array.from(branchMap.values()).map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _nodeMap, ...rest } = b;
    return rest;
  });

  return {
    schema: 'xml-cii-2019-custom-input',
    branches,
  };
}
