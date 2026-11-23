import { describe, it, expect } from 'vitest';
import { buildCustomInputModel } from '../customInputModel';
import {
  detectCustomInputBends,
  applyCustomInputBends,
  calculateTurnAngleDeg,
} from '../autoTopology';
import {
  buildDirectCaesarXmlFromTables,
} from '../customInputXmlWriter';
import type { FullXmlBuilderModel } from '../../types';

describe('CAESAR II XML & Topology Engine (Component 2)', () => {
  it('calculates 3D turn angles correctly', () => {
    // 90° right angle in horizontal XY plane: (0, 100, 0) -> (0, 0, 0) -> (100, 0, 0)
    const angle90 = calculateTurnAngleDeg([0, 100, 0], [0, 0, 0], [100, 0, 0]);
    expect(angle90).toBe(90);

    // Straight line: (0, 100, 0) -> (0, 0, 0) -> (0, -100, 0)
    const angle180 = calculateTurnAngleDeg([0, 100, 0], [0, 0, 0], [0, -100, 0]);
    expect(angle180).toBe(180);
  });

  it('builds CustomInputModel with nodes, lengths, and attributes', () => {
    const tables: Partial<FullXmlBuilderModel> = {
      branchRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, boreMm: 150, wallThickness: 7.11, p1: 16, t1: 180 },
      ],
      coordinateRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, x: 0, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 110, x: 2000, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 120, x: 2000, y: 2000, z: 100000, pageNumber: 1, annotationId: 'a1' },
      ],
      restraintRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, nodeName: 'ANC-100', restraintType: 'ANC' },
      ],
    };

    const model = buildCustomInputModel(tables);
    expect(model.branches).toHaveLength(1);
    expect(model.branches[0].branchName).toBe('/SYS-008A/B1');
    expect(model.branches[0].nodes).toHaveLength(3);
    expect(model.branches[0].nodes[0].nodeNumber).toBe('100');
    expect(model.branches[0].nodes[0].restraints).toHaveLength(1);
    expect(model.branches[0].nodes[0].restraints?.[0].type).toBe('ANC');
  });

  it('detects and applies auto-bends at 90° direction changes', () => {
    const tables: Partial<FullXmlBuilderModel> = {
      branchRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, boreMm: 100, wallThickness: 6.02, p1: 10, t1: 120 },
      ],
      coordinateRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, x: 0, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 110, x: 3000, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 120, x: 3000, y: 3000, z: 100000, pageNumber: 1, annotationId: 'a1' },
      ],
    };

    const model = buildCustomInputModel(tables);
    const hits = detectCustomInputBends(model);
    expect(hits).toHaveLength(1);
    expect(hits[0].nodeNumber).toBe('110');
    expect(hits[0].bendType).toBe('ELBOW 90');

    applyCustomInputBends(model);
    const bendNode = model.branches[0].nodes.find((n) => n.nodeNumber === '110');
    expect(bendNode?.componentType).toBe('BEND');
    expect(bendNode?.bendRadius).toBe('150.0'); // 1.5 * 100 mm = 150 mm LR elbow
  });

  it('generates valid CAESAR II XML document', () => {
    const tables: Partial<FullXmlBuilderModel> = {
      branchRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, boreMm: 150, wallThickness: 7.11, p1: 16, t1: 150, fluidDensity: 1000 },
      ],
      coordinateRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, x: 0, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 110, x: 2500, y: 0, z: 100000, pageNumber: 1, annotationId: 'a1' },
        { branchName: '/SYS-008A/B1', nodeNumber: 120, x: 2500, y: 2500, z: 100000, pageNumber: 1, annotationId: 'a1' },
      ],
      restraintRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, nodeName: 'ANC-1', restraintType: 'ANC' },
        { branchName: '/SYS-008A/B1', nodeNumber: 120, nodeName: 'G-120', restraintType: 'GUIDE' },
      ],
      weightRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, componentType: 'VALVE', rigid: true, endpoint: 105, weight: 120, componentRefNo: 'V-101' },
      ],
      dtxrRows: [
        { branchName: '/SYS-008A/B1', nodeNumber: 100, dtxr: 'DX=5 DY=10 DZ=-2' },
      ],
    };

    const xml = buildDirectCaesarXmlFromTables(tables, { autoBend: true });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Root>');
    expect(xml).toContain('<Branchname>/SYS-008A/B1</Branchname>');
    expect(xml).toContain('<Pressure1>16</Pressure1>');
    expect(xml).toContain('<Temperature1>150</Temperature1>');
    expect(xml).toContain('<FluidDensity>1000</FluidDensity>');

    // Check Node 100 with Anchor and DTXR
    expect(xml).toContain('<NodeNumber>100</NodeNumber>');
    expect(xml).toContain('<Type>ANC</Type>');
    expect(xml).toContain('<DTXR_POS>DX=5 DY=10 DZ=-2</DTXR_POS>');

    // Check Node 110 with Auto-Bend
    expect(xml).toContain('<NodeNumber>110</NodeNumber>');
    expect(xml).toContain('<ComponentType>BEND</ComponentType>');
    expect(xml).toContain('<BendRadius>225.0</BendRadius>'); // 1.5 * 150 = 225

    // Check Node 120 with Guide
    expect(xml).toContain('<NodeNumber>120</NodeNumber>');
    expect(xml).toContain('<Type>GUIDE</Type>');

    expect(xml).toContain('</Root>');
  });
});
