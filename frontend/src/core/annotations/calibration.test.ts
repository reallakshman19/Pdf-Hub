import { describe, it, expect } from 'vitest';
import {
  computeRealWorldDistance,
  formatDimensionLabel,
  calibrateScaleFromPoints,
  DEFAULT_SCALE_CALIBRATION,
} from './calibration';

describe('calibration math & dimension formatting', () => {
  it('computes real world distance in mm for 1:100 scale', () => {
    // 72 points = 25.4 mm on sheet. At 1:100 scale, that is 2540 mm.
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 72, y: 0 };
    const dist = computeRealWorldDistance(p1, p2, { scaleRatio: 100, unit: 'mm', precision: 0 });
    expect(Math.round(dist)).toBe(2540);
  });

  it('formats dimension label with precision and units', () => {
    // Distance matching 2200 mm in 1:100 scale
    // 2200 / 100 = 22 mm on sheet. 22 / 25.4 * 72 = 62.362 points.
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 162.362, y: 100 };
    const label = formatDimensionLabel(p1, p2, DEFAULT_SCALE_CALIBRATION);
    expect(label).toBe('2,200 mm');
  });

  it('computes meters and feet accurately', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 72, y: 0 }; // 2.54 meters at 1:100
    const mLabel = formatDimensionLabel(p1, p2, { scaleRatio: 100, unit: 'm', precision: 2 });
    expect(mLabel).toBe('2.54 m');

    const ftLabel = formatDimensionLabel(p1, p2, { scaleRatio: 48, unit: 'ft', precision: 1 });
    expect(ftLabel).toBe('4 ft');
  });

  it('calibrates scale ratio from known measurement', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 72, y: 0 }; // 25.4 mm on sheet
    const calibrated = calibrateScaleFromPoints(p1, p2, 5080, 'mm'); // 5080 mm = 1:200
    expect(calibrated.scaleRatio).toBe(200);
    expect(calibrated.unit).toBe('mm');
  });
});
