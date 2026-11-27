import { describe, expect, it } from 'vitest';
import { extractVectorsFromOperatorList } from '../pdfOperatorVectorExtractor';
import { CadWorkerClient } from '../cadWorkerClient';
import type { CadHarvestProgress, OperatorVectorsHarvestInput } from '../cadWorkerTypes';

const TEST_OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  endPath: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  closeFillStroke: 25,
  eoFillStroke: 26,
  closeEOFillStroke: 27,
  setLineWidth: 2,
  setDash: 6,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginMarkedContent: 78,
  beginMarkedContentProps: 79,
  endMarkedContent: 80,
  paintImageXObject: 85,
  constructPath: 91,
} as const;

describe('extractVectorsFromOperatorList (Layer 1 pure OperatorList interpreter)', () => {
  it('interprets pdf.js v5 constructPath packed Float32Array (lines, curves, closePath, viewport flip)', () => {
    // Draw ops: 0=moveTo(2), 1=lineTo(2), 2=curveTo(6), 3=quadratic(4), 4=closePath(0)
    const rectOps = new Float32Array([
      0, 100, 100, // moveTo(100, 100)
      1, 200, 100, // lineTo(200, 100)
      1, 200, 150, // lineTo(200, 150)
      1, 100, 150, // lineTo(100, 150)
      4, // closePath -> returns to (100, 100)
    ]);
    const curveOps = new Float32Array([
      0, 20, 20, // moveTo(20, 20)
      2, 20, 40, 40, 60, 60, 60, // cubic curveTo
    ]);

    const summary = extractVectorsFromOperatorList(
      {
        fnArray: [
          TEST_OPS.setStrokeRGBColor,
          TEST_OPS.setLineWidth,
          TEST_OPS.constructPath,
          TEST_OPS.constructPath,
        ],
        argsArray: [
          ['#ff0000'],
          [2.5],
          [TEST_OPS.stroke, [rectOps], [100, 100, 200, 150]],
          [TEST_OPS.stroke, [curveOps], [20, 20, 60, 60]],
        ],
        ops: { ...TEST_OPS },
      },
      {
        pageNumber: 1,
        pageWidth: 400,
        pageHeight: 300,
        // Standard top-down viewport flip: y' = 300 - y
        viewportTransform: [1, 0, 0, -1, 0, 300],
      },
    );

    expect(summary.geometry.rectangles).toHaveLength(1);
    expect(summary.geometry.rectangles[0]).toMatchObject({
      x: 100,
      y: 150, // 300 - 150
      width: 100,
      height: 50,
      strokeColor: '#ff0000',
      strokeWidth: 2.5,
    });

    // 4 edges of the closed rectangle
    expect(summary.geometry.lines).toHaveLength(4);
    expect(summary.geometry.lines[0].start).toEqual({ x: 100, y: 200 }); // 300 - 100
    expect(summary.geometry.lines[0].end).toEqual({ x: 200, y: 200 });

    // 1 cubic curve
    expect(summary.geometry.beziers).toHaveLength(1);
    expect(summary.geometry.beziers[0].p0).toEqual({ x: 20, y: 280 });
    expect(summary.geometry.beziers[0].p3).toEqual({ x: 60, y: 240 });
  });

  it('resolves nested Form XObject CTM matrices, dashed styles, and state save/restore isolation', () => {
    const xobjLine = new Float32Array([0, 0, 0, 1, 10, 0]);
    const outerLine = new Float32Array([0, 5, 5, 1, 5, 25]);

    const summary = extractVectorsFromOperatorList(
      {
        fnArray: [
          TEST_OPS.save,
          TEST_OPS.setStrokeRGBColor,
          TEST_OPS.setDash,
          TEST_OPS.paintFormXObjectBegin,
          TEST_OPS.constructPath,
          TEST_OPS.paintFormXObjectEnd,
          TEST_OPS.restore,
          // After restore, CTM & dash reset to default
          TEST_OPS.constructPath,
        ],
        argsArray: [
          [],
          ['#0000ff'],
          [[6, 3], 1.5],
          [[2, 0, 0, 2, 50, 100]], // scale 2x + translate(50, 100)
          [TEST_OPS.stroke, [xobjLine], [0, 0, 10, 0]],
          [],
          [],
          [TEST_OPS.stroke, [outerLine], [5, 5, 5, 25]],
        ],
        ops: { ...TEST_OPS },
      },
      {
        pageNumber: 2,
        pageWidth: 500,
        pageHeight: 500,
      },
    );

    expect(summary.geometry.lines).toHaveLength(2);
    const [first, second] = summary.geometry.lines;
    // (0,0) -> (50,100), (10,0) -> (70,100)
    expect(first.start).toEqual({ x: 50, y: 100 });
    expect(first.end).toEqual({ x: 70, y: 100 });
    expect(first.strokeColor).toBe('#0000ff');
    expect(first.dashArray).toEqual([6, 3]);
    expect(first.dashPhase).toBe(1.5);
    expect(first.strokeWidth).toBe(2); // scaled by CTM=2

    // Outer line unaffected by XObject matrix or dashed style
    expect(second.start).toEqual({ x: 5, y: 5 });
    expect(second.end).toEqual({ x: 5, y: 25 });
    expect(second.strokeColor).toBe('#000000');
    expect(second.dashArray).toBeUndefined();
    expect(second.strokeWidth).toBe(1);
  });

  it('tracks OCG layers, filters by includeLayers, regionRect ROI, fill-only paths, and raster images', () => {
    const pipeSeg = new Float32Array([0, 20, 20, 1, 80, 20]);
    const gridSegOutOfRoi = new Float32Array([0, 300, 300, 1, 400, 300]);
    const fillBlob = new Float32Array([0, 30, 30, 1, 40, 30, 1, 40, 40, 4]);

    const summary = extractVectorsFromOperatorList(
      {
        fnArray: [
          TEST_OPS.beginMarkedContentProps,
          TEST_OPS.constructPath,
          TEST_OPS.endMarkedContent,
          TEST_OPS.beginMarkedContentProps,
          TEST_OPS.constructPath,
          TEST_OPS.constructPath,
          TEST_OPS.endMarkedContent,
          TEST_OPS.paintImageXObject,
        ],
        argsArray: [
          ['OC', { id: 'oc_piping' }],
          [TEST_OPS.stroke, [pipeSeg], [20, 20, 80, 20]],
          [],
          ['OC', { id: 'oc_grid' }],
          [TEST_OPS.stroke, [gridSegOutOfRoi], [300, 300, 400, 300]],
          [TEST_OPS.fill, [fillBlob], [30, 30, 40, 40]],
          [],
          ['img1', 100, 100],
        ],
        ops: { ...TEST_OPS },
        ocgLayerNames: {
          oc_piping: 'A-PIPING-MAIN',
          oc_grid: 'S-GRID',
        },
      },
      {
        pageNumber: 1,
        extractOptions: {
          includeFillOnlyPaths: false,
          regionRect: { x: 0, y: 0, width: 120, height: 120 },
        },
      },
    );

    expect(summary.layersDetected).toEqual(['A-PIPING-MAIN', 'S-GRID']);
    expect(summary.imageXObjectCount).toBe(1);
    expect(summary.skippedOutOfRegionCount).toBe(1);
    expect(summary.geometry.lines).toHaveLength(1);
    expect(summary.geometry.lines[0].layerName).toBe('A-PIPING-MAIN');
    // Fill-only blob skipped because includeFillOnlyPaths is false
    expect(summary.geometry.rectangles).toHaveLength(0);

    // Filter specifically to S-GRID only (without regionRect)
    const gridOnly = extractVectorsFromOperatorList(
      {
        fnArray: [
          TEST_OPS.beginMarkedContentProps,
          TEST_OPS.constructPath,
          TEST_OPS.endMarkedContent,
          TEST_OPS.beginMarkedContentProps,
          TEST_OPS.constructPath,
          TEST_OPS.endMarkedContent,
        ],
        argsArray: [
          ['OC', { id: 'oc_piping' }],
          [TEST_OPS.stroke, [pipeSeg]],
          [],
          ['OC', { id: 'oc_grid' }],
          [TEST_OPS.stroke, [gridSegOutOfRoi]],
          [],
        ],
        ops: { ...TEST_OPS },
        ocgLayerNames: { oc_piping: 'A-PIPING-MAIN', oc_grid: 'S-GRID' },
      },
      {
        extractOptions: {
          includeLayers: ['S-GRID'],
        },
      },
    );

    expect(gridOnly.geometry.lines).toHaveLength(1);
    expect(gridOnly.geometry.lines[0].layerName).toBe('S-GRID');
  });

  it('offloads OperatorList vector harvesting cleanly through CadWorkerClient', async () => {
    const client = new CadWorkerClient();
    const pipeOps = new Float32Array([0, 10, 10, 1, 110, 10, 1, 110, 60]);
    const progressEvents: CadHarvestProgress[] = [];

    const input: OperatorVectorsHarvestInput = {
      pageNumber: 3,
      pageWidth: 612,
      pageHeight: 792,
      operatorList: {
        fnArray: [TEST_OPS.beginMarkedContentProps, TEST_OPS.constructPath, TEST_OPS.endMarkedContent],
        argsArray: [['OC', { id: 'oc1' }], [TEST_OPS.stroke, [pipeOps]], []],
        ops: { ...TEST_OPS },
        ocgLayerNames: { oc1: 'P-PROCESS' },
      },
      cleanOptions: { snapEpsilon: 0.5 },
    };

    const result = await client.harvestOperatorListVectors(input, {
      onProgress: (p) => progressEvents.push(p),
    });

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[progressEvents.length - 1].progressPercent).toBe(100);
    expect(result.geometry.pageNumber).toBe(3);
    expect(result.geometry.lines).toHaveLength(2);
    expect(result.layersDetected).toEqual(['P-PROCESS']);
    expect(result.isRasterOnlyLikely).toBe(false);
    expect(result.telemetry.rawSegmentsCount).toBe(2);

    client.terminate();
  });
});
