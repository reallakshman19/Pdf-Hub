import { describe, expect, it } from 'vitest';
import {
  computeTakeoffSummary,
  generateTakeoffCsv,
  pointsToRealArea,
  pointsToRealDistance,
} from './takeoffExport';
import type { PdfAnnotation } from './types';
import type { ScaleCalibration } from './calibration';

describe('takeoffExport engine', () => {
  const cal100mm: ScaleCalibration = {
    scaleRatio: 100,
    unit: 'mm',
    precision: 0,
  };

  it('converts points to real distance accurately', () => {
    // 72 pt = 1 inch = 25.4 mm on sheet. At 1:100 scale, real world = 2540 mm.
    const realMm = pointsToRealDistance(72, cal100mm);
    expect(realMm).toBeCloseTo(2540, 1);
  });

  it('converts square points to real area accurately', () => {
    // 72 pt x 72 pt = 2540 mm x 2540 mm in real world = 6,451,600 mm²
    const realMm2 = pointsToRealArea(72 * 72, cal100mm);
    expect(realMm2).toBeCloseTo(6451600, -1);
  });

  it('aggregates item counts and linear lengths for callouts and lines', () => {
    const annotations: PdfAnnotation[] = [
      {
        id: 'callout-1',
        type: 'callout',
        pageNumber: 1,
        rect: { x: 10, y: 10, width: 80, height: 30 },
        createdAt: 1,
        updatedAt: 1,
        data: { text: 'Rest\nAxial Stop' },
      },
      {
        id: 'callout-2',
        type: 'callout',
        pageNumber: 1,
        rect: { x: 100, y: 10, width: 80, height: 30 },
        createdAt: 2,
        updatedAt: 2,
        data: { text: 'Rest Axial Stop' },
      },
      {
        id: 'line-1',
        type: 'line',
        pageNumber: 1,
        rect: { x: 50, y: 50, width: 72, height: 0 },
        createdAt: 3,
        updatedAt: 3,
        data: { points: [50, 50, 122, 50] },
      },
    ];

    const summary = computeTakeoffSummary(annotations, () => cal100mm);

    expect(summary.totalItemCount).toBe(3);
    // Two callouts with same normalized text 'Rest Axial Stop' are grouped
    const calloutGroup = summary.groups.find((g) => g.type === 'callout');
    expect(calloutGroup).toBeDefined();
    expect(calloutGroup?.count).toBe(2);
    expect(calloutGroup?.label).toBe('Rest Axial Stop');

    const lineGroup = summary.groups.find((g) => g.type === 'line');
    expect(lineGroup).toBeDefined();
    expect(lineGroup?.count).toBe(1);
    expect(lineGroup?.totalLengthReal).toBeCloseTo(2540, 1);
  });

  it('generates properly formatted and escaped CSV', () => {
    const annotations: PdfAnnotation[] = [
      {
        id: 'callout-1',
        type: 'callout',
        pageNumber: 1,
        rect: { x: 10, y: 10, width: 80, height: 30 },
        createdAt: 1,
        updatedAt: 1,
        data: { text: 'Piping, 4" High Pressure' },
      },
    ];

    const summary = computeTakeoffSummary(annotations, () => cal100mm);
    const csv = generateTakeoffCsv(summary);

    expect(csv).toContain('Type,Label / Description,Count,Total Length,Total Area,Unit,Pages');
    // Field with commas and quotes must be properly escaped
    expect(csv).toContain('"Piping, 4"" High Pressure"');
    expect(csv).toContain('TOTAL,All Annotations,1');
  });
});
