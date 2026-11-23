import { describe, it, expect } from 'vitest';
import type { PdfAnnotation } from '../../annotations/types';
import type { ScaleCalibration } from '../../annotations/calibration';
import {
  extractPipelineBranches,
  generateXmlBuilderBranchTsv,
  parsePipeSizeFromText,
} from '../pipelineBranchExport';
import {
  extractPipelineRestraints,
  generateXmlBuilderRestraintTsv,
} from '../pipelineRestraintExport';
import {
  extractPipelineWeights,
  extractPipelineDtxr,
  generateXmlBuilderWeightTsv,
  generateXmlBuilderDtxrTsv,
} from '../pipelineComponentExport';
import {
  extractFullXmlBuilderModel,
  serializeXmlBuilderTablesToTsv,
  createXmlBuilderLaunchUrl,
} from '../pipelineModelAggregator';

describe('Pipeline Multi-Table Extraction Engine (Component 1)', () => {
  const mockCalibration: ScaleCalibration = {
    unit: 'mm',
    scaleRatio: 100, // 1:100 scale (72 pt = 2540 mm)
    precision: 0,
  };
  const getCalibration = () => mockCalibration;

  it('parses standard pipe sizes from text labels', () => {
    expect(parsePipeSizeFromText('6"-P-101')?.boreMm).toBe(150);
    expect(parsePipeSizeFromText('4" SCH 40')?.boreMm).toBe(100);
    expect(parsePipeSizeFromText('DN200')?.boreMm).toBe(200);
    expect(parsePipeSizeFromText('unknown text')).toBeNull();
  });

  it('extracts branchRows with bore, wall thickness, and design conditions', () => {
    const coords = [
      { branchName: '/LINE-101/6"-CS150', nodeNumber: 100, x: 1000, y: 2000, z: 100000, pageNumber: 1, annotationId: 'ann-1' },
      { branchName: '/LINE-101/6"-CS150', nodeNumber: 110, x: 3540, y: 2000, z: 100000, pageNumber: 1, annotationId: 'ann-1' },
    ];

    const branchRows = extractPipelineBranches(coords);
    expect(branchRows).toHaveLength(1);
    expect(branchRows[0].branchName).toBe('/LINE-101/6"-CS150');
    expect(branchRows[0].nodeNumber).toBe(100);
    expect(branchRows[0].boreMm).toBe(150); // 6"
    expect(branchRows[0].wallThickness).toBe(7.11);
    expect(branchRows[0].p1).toBe(16);
    expect(branchRows[0].t1).toBe(150);

    const tsv = generateXmlBuilderBranchTsv(branchRows);
    expect(tsv).toContain('branchName\tnodeNumber\tboreMm\twallThickness\tp1\tt1\tt2\tt3\tfluidDensity');
    expect(tsv).toContain('/LINE-101/6"-CS150\t100\t150\t7.11\t16\t150\t21\t21\t1000');
  });

  it('extracts restraintRows and maps supports to nearest pipe node', () => {
    const coords = [
      { branchName: '/PIPE-1/B1', nodeNumber: 100, x: 0, y: 0, z: 100000, pageNumber: 1, annotationId: 'p1' },
      { branchName: '/PIPE-1/B1', nodeNumber: 110, x: 5000, y: 0, z: 100000, pageNumber: 1, annotationId: 'p1' },
    ];

    // Annotation near node 100 (x: 0, y: 0 in mm -> pt approx 0, 0)
    const anchorAnn: PdfAnnotation = {
      id: 'supp-1',
      type: 'piping-support',
      pageNumber: 1,
      rect: { x: 5, y: 5, width: 20, height: 20 },
      data: { restraintType: 'ANC', label: 'ANCHOR-100' },
      createdAt: 0,
      updatedAt: 0,
    };

    // Callout near node 110 (x: 5000 mm -> 5000 / (25.4 * 100 / 72) ≈ 141.7 pt)
    const guideAnn: PdfAnnotation = {
      id: 'supp-2',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 140, y: 5, width: 30, height: 30 },
      data: { text: 'GUIDE SUPPORT G-10', anchor: { x: 141.7, y: 0 } },
      createdAt: 0,
      updatedAt: 0,
    };

    const restraints = extractPipelineRestraints([anchorAnn, guideAnn], coords, getCalibration);
    expect(restraints).toHaveLength(2);
    expect(restraints[0].nodeNumber).toBe(100);
    expect(restraints[0].restraintType).toBe('ANC');

    expect(restraints[1].nodeNumber).toBe(110);
    expect(restraints[1].restraintType).toBe('GUIDE');

    const tsv = generateXmlBuilderRestraintTsv(restraints);
    expect(tsv).toContain('branchName\tnodeNumber\tnodeName\trestraintType\tgap\tstiffness\tfriction\tdirection');
    expect(tsv).toContain('/PIPE-1/B1\t100\tANCHOR-100\tANC');
    expect(tsv).toContain('/PIPE-1/B1\t110\tGUIDE-110\tGUIDE');
  });

  it('extracts weightRows and dtxrRows for valves and equipment nozzle thermal growth', () => {
    const coords = [
      { branchName: '/PIPE-1/B1', nodeNumber: 100, x: 0, y: 0, z: 100000, pageNumber: 1, annotationId: 'p1' },
      { branchName: '/PIPE-1/B1', nodeNumber: 110, x: 2540, y: 0, z: 100000, pageNumber: 1, annotationId: 'p1' },
    ];

    const valveAnn: PdfAnnotation = {
      id: 'v-1',
      type: 'piping-valve',
      pageNumber: 1,
      rect: { x: 36, y: 0, width: 20, height: 20 }, // 36 pt = 1270 mm (midpoint)
      data: { label: 'V-101', componentType: 'VALVE', weight: 95 },
      createdAt: 0,
      updatedAt: 0,
    };

    const nozzleAnn: PdfAnnotation = {
      id: 'dtxr-1',
      type: 'callout',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 30, height: 20 },
      data: { text: 'NOZZLE N1: DX=4.5 DY=12.0 DZ=-1.5' },
      createdAt: 0,
      updatedAt: 0,
    };

    const weights = extractPipelineWeights([valveAnn], coords, getCalibration);
    expect(weights).toHaveLength(1);
    expect(weights[0].componentType).toBe('VALVE');
    expect(weights[0].weight).toBe(95);
    expect(weights[0].rigid).toBe(true);

    const dtxr = extractPipelineDtxr([nozzleAnn], coords, getCalibration);
    expect(dtxr).toHaveLength(1);
    expect(dtxr[0].nodeNumber).toBe(100);
    expect(dtxr[0].dtxr).toContain('DX=4.5');

    const weightTsv = generateXmlBuilderWeightTsv(weights);
    expect(weightTsv).toContain('/PIPE-1/B1\t');
    expect(weightTsv).toContain('VALVE\tTRUE');

    const dtxrTsv = generateXmlBuilderDtxrTsv(dtxr);
    expect(dtxrTsv).toContain('/PIPE-1/B1\t100\tNOZZLE N1: DX=4.5 DY=12.0 DZ=-1.5');
  });

  it('aggregates all 5 tables and generates full launch URL', () => {
    const pipeAnn: PdfAnnotation = {
      id: 'pipe-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      data: {
        branchName: '/SYS-008A/4"-LINE',
        points: [0, 0, 72, 0, 72, 72], // L-shaped run (2 segments)
      },
      createdAt: 0,
      updatedAt: 0,
    };

    const supportAnn: PdfAnnotation = {
      id: 'supp-1',
      type: 'piping-support',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 20, height: 20 },
      data: { restraintType: 'ANC', label: 'ANCHOR-100' },
      createdAt: 0,
      updatedAt: 0,
    };

    const model = extractFullXmlBuilderModel([pipeAnn, supportAnn], getCalibration);
    expect(model.coordinateRows).toHaveLength(3);
    expect(model.branchRows).toHaveLength(1);
    expect(model.restraintRows).toHaveLength(1);

    const tables = serializeXmlBuilderTablesToTsv(model);
    expect(tables.coordinateRows).toContain('BranchName\tNodeNumber\tX\tY\tZ');
    expect(tables.branchRows).toContain('branchName\tnodeNumber\tboreMm\twallThickness');
    expect(tables.restraintRows).toContain('branchName\tnodeNumber\tnodeName\trestraintType');

    const launchUrl = createXmlBuilderLaunchUrl(model);
    expect(launchUrl).toContain('https://reallakshman19.github.io/XML_Compare_Utilities');
    expect(launchUrl).toContain('tool=xml-builder#customInput=');
  });
});
