import { describe, expect, it } from 'vitest';
import {
  extractPipelineCoordinates,
  generatePipelineCoordinateCsv,
  generateXmlBuilderCoordinateTsv,
  pdfPointsToRealMm,
} from './pipelineCoordinateExport';
import type { PdfAnnotation } from '../annotations/types';
import type { ScaleCalibration } from '../annotations/calibration';

describe('pipelineCoordinateExport engine', () => {
  const cal100: ScaleCalibration = {
    scaleRatio: 100,
    unit: 'mm',
    precision: 0,
  };

  it('accurately converts PDF points to real-world millimeters at 1:100 scale', () => {
    // 72 points = 1 inch = 25.4 mm. At 1:100, real world = 2540 mm.
    const mm = pdfPointsToRealMm(72, 100);
    expect(mm).toBeCloseTo(2540, 1);
  });

  it('extracts start and end nodes for a 2D line annotation', () => {
    const lineAnn: PdfAnnotation = {
      id: 'line-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 72, y: 144, width: 72, height: 0 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        text: '/LINE-1001/B1',
      },
    };

    const rows = extractPipelineCoordinates([lineAnn], () => cal100, {
      startNodeNumber: 100,
      nodeIncrement: 10,
      defaultElevationZ: 101000,
    });

    expect(rows).toHaveLength(2);
    // Node 100 (start)
    expect(rows[0].nodeNumber).toBe(100);
    expect(rows[0].branchName).toBe('/LINE-1001/B1');
    expect(rows[0].x).toBeCloseTo(2540, 0);
    expect(rows[0].y).toBeCloseTo(5080, 0);
    expect(rows[0].z).toBe(101000);
    expect(rows[0].lengthToNextMm).toBeCloseTo(2540, 0);

    // Node 110 (end)
    expect(rows[1].nodeNumber).toBe(110);
    expect(rows[1].x).toBeCloseTo(5080, 0);
    expect(rows[1].y).toBeCloseTo(5080, 0);
    expect(rows[1].z).toBe(101000);
  });

  it('extracts sequential nodes and segment lengths for multi-vertex pipe runs', () => {
    const pipeRunAnn: PdfAnnotation = {
      id: 'pipe-run-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 216, height: 144 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        branchName: '/CUSTOM-4"-P8810212/B1',
        // 3 vertices: (72, 72) -> (144, 72) -> (144, 144)
        points: [72, 72, 144, 72, 144, 144],
      },
    };

    const rows = extractPipelineCoordinates([pipeRunAnn], () => cal100, {
      startNodeNumber: 200,
      nodeIncrement: 10,
      defaultElevationZ: 95000,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].nodeNumber).toBe(200);
    expect(rows[0].x).toBeCloseTo(2540, 0);
    expect(rows[0].y).toBeCloseTo(2540, 0);
    expect(rows[0].z).toBe(95000);
    expect(rows[0].lengthToNextMm).toBeCloseTo(2540, 0);

    expect(rows[1].nodeNumber).toBe(210);
    expect(rows[1].x).toBeCloseTo(5080, 0);
    expect(rows[1].y).toBeCloseTo(2540, 0);
    expect(rows[1].lengthToNextMm).toBeCloseTo(2540, 0);

    expect(rows[2].nodeNumber).toBe(220);
    expect(rows[2].x).toBeCloseTo(5080, 0);
    expect(rows[2].y).toBeCloseTo(5080, 0);
    expect(rows[2].lengthToNextMm).toBeUndefined();
  });

  it('formats exact TSV compatible with XML Builder > Coordinates', () => {
    const rows = [
      {
        branchName: '/CUSTOM-4"-P8810212-31441C4-PP/B1',
        nodeNumber: 100,
        x: 200000,
        y: -1098000,
        z: 101000,
        pageNumber: 1,
        annotationId: 'ann-1',
      },
      {
        branchName: '/CUSTOM-4"-P8810212-31441C4-PP/B1',
        nodeNumber: 110,
        x: 200500,
        y: -1098000,
        z: 101000,
        pageNumber: 1,
        annotationId: 'ann-1',
      },
    ];

    const tsv = generateXmlBuilderCoordinateTsv(rows);
    const expected =
      'BranchName\tNodeNumber\tX\tY\tZ\n' +
      '/CUSTOM-4"-P8810212-31441C4-PP/B1\t100\t200000\t-1098000\t101000\n' +
      '/CUSTOM-4"-P8810212-31441C4-PP/B1\t110\t200500\t-1098000\t101000';

    expect(tsv).toBe(expected);
  });

  it('formats detailed CSV with headers and length deltas', () => {
    const rows = [
      {
        branchName: '/BRANCH-1/B1',
        nodeNumber: 100,
        x: 1000,
        y: 2000,
        z: 3000,
        pageNumber: 1,
        annotationId: 'ann-1',
        lengthToNextMm: 500,
      },
    ];

    const csv = generatePipelineCoordinateCsv(rows);
    expect(csv).toContain('BranchName,NodeNumber,X_mm,Y_mm,Z_mm,LengthToNext_mm,Page,AnnotationId');
    expect(csv).toContain('"/BRANCH-1/B1",100,1000,2000,3000,500,1,"ann-1"');
  });

  it('performs true 3D isometric routing with vertical risers/drops and spatial cut length', () => {
    // Pipe run drawn on isometric sheet:
    // (72, 72) -> vertical up to (72, 0) -> East to (144, 41.5)
    const isoPipeRun: PdfAnnotation = {
      id: 'pipe-iso-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 200, height: 200 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        branchName: '/ISO-RUN/B1',
        // Start at (72, 72), draw UP on sheet to (72, 0) [dy = -72, vertical riser], then East
        points: [72, 72, 72, 0, 144, 41.57],
      },
    };

    const rows = extractPipelineCoordinates([isoPipeRun], () => cal100, {
      startNodeNumber: 100,
      nodeIncrement: 10,
      defaultElevationZ: 100000,
      routingMode: 'isometric',
    });

    expect(rows).toHaveLength(3);
    // Node 100: baseline
    expect(rows[0].nodeNumber).toBe(100);
    expect(rows[0].z).toBe(100000);

    // Node 110: vertical riser UP (+2540 mm elevation)
    expect(rows[1].nodeNumber).toBe(110);
    expect(rows[1].z).toBeCloseTo(102540, 0);
    expect(rows[0].lengthToNextMm).toBeCloseTo(2540, 0);

    // Node 120: horizontal run in elevation plane
    expect(rows[2].nodeNumber).toBe(120);
    expect(rows[2].z).toBeCloseTo(102540, 0);
    expect(rows[1].lengthToNextMm).toBeGreaterThan(0);
  });

  it('respects custom node elevations when provided', () => {
    const lineAnn: PdfAnnotation = {
      id: 'line-elev',
      type: 'line',
      pageNumber: 1,
      rect: { x: 0, y: 0, width: 72, height: 72 },
      createdAt: 1,
      updatedAt: 1,
      data: {
        branchName: '/ELEV-LINE/B1',
        points: [0, 0, 72, 0],
      },
    };

    const rows = extractPipelineCoordinates([lineAnn], () => cal100, {
      startNodeNumber: 100,
      defaultElevationZ: 100000,
      nodeElevations: {
        100: 105000,
        110: 107500,
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].z).toBe(105000);
    expect(rows[1].z).toBe(107500);
    // 3D spatial hypotenuse between (0, 0, 105000) and (2540, 0, 107500):
    // dx = 2540, dz = 2500 -> hypot ~ 3564 mm
    expect(rows[0].lengthToNextMm).toBeCloseTo(3564, -1);
  });
});
