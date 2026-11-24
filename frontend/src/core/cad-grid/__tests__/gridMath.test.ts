import { describe, expect, it } from 'vitest';
import {
  snapToOrthogonalGrid,
  snapToIsometricGrid,
  constrainAngleToIsoplane,
  computePolarTracking,
} from '../gridMath';

describe('CAD Grid Math & Polar Telemetry', () => {
  describe('snapToOrthogonalGrid', () => {
    it('snaps coordinates to nearest grid interval', () => {
      expect(snapToOrthogonalGrid({ x: 23, y: 38 }, 20)).toEqual({ x: 20, y: 40 });
      expect(snapToOrthogonalGrid({ x: 9, y: 11 }, 20)).toEqual({ x: 0, y: 20 });
      expect(snapToOrthogonalGrid({ x: 100, y: 200 }, 50)).toEqual({ x: 100, y: 200 });
    });

    it('returns point untouched if spacing <= 0', () => {
      expect(snapToOrthogonalGrid({ x: 15, y: 25 }, 0)).toEqual({ x: 15, y: 25 });
    });
  });

  describe('snapToIsometricGrid', () => {
    it('snaps points to the isometric lattice nodes', () => {
      const spacing = 20;
      const dxStep = spacing * (Math.sqrt(3) / 2); // ~17.3205

      // Node (0, 0)
      const ptNearOrigin = { x: 2, y: 1 };
      const snapped0 = snapToIsometricGrid(ptNearOrigin, spacing);
      expect(snapped0.x).toBeCloseTo(0, 1);
      expect(snapped0.y).toBeCloseTo(0, 1);

      // Node (1, 10): column 1 has yOffset = 10
      const ptNearCol1 = { x: dxStep + 1, y: 11 };
      const snapped1 = snapToIsometricGrid(ptNearCol1, spacing);
      expect(snapped1.x).toBeCloseTo(dxStep, 1);
      expect(snapped1.y).toBeCloseTo(10, 1);
    });
  });

  describe('constrainAngleToIsoplane', () => {
    it('constrains angles to 30°/90°/150°/etc. for all isoplanes', () => {
      const origin = { x: 100, y: 100 };
      // Target pointing roughly +30° in drafting (which is -dy in screen space)
      const targetNear30 = { x: 200, y: 45 };
      const constrained30 = constrainAngleToIsoplane(origin, targetNear30, 'all');

      const dx = constrained30.x - origin.x;
      const dy = constrained30.y - origin.y;
      const draftingAngleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;
      expect(draftingAngleDeg).toBeCloseTo(30, 0);
    });

    it('restricts to top plane (30°/150°/210°/330°) when isoplane=top', () => {
      const origin = { x: 100, y: 100 };
      // Near 90° (up), but top plane only has 30° and 150°
      const targetNear90 = { x: 105, y: 10 };
      const constrained = constrainAngleToIsoplane(origin, targetNear90, 'top');

      const dx = constrained.x - origin.x;
      const dy = constrained.y - origin.y;
      const draftingAngleDeg = (-Math.atan2(dy, dx) * 180) / Math.PI;
      // Should snap to 30° or 150°, not 90°
      expect([30, 150]).toContain(Math.round(draftingAngleDeg));
    });
  });

  describe('computePolarTracking', () => {
    it('computes length, angle, and axis tags correctly', () => {
      const origin = { x: 0, y: 100 };
      // 100 points East (0° drafting angle)
      const targetEast = { x: 100, y: 100 };
      const polarEast = computePolarTracking(origin, targetEast, {
        scaleRatio: 100,
        unit: 'mm',
        precision: 0,
      });

      expect(polarEast.angleDeg).toBe(0);
      expect(polarEast.isOrthoAxis).toBe(true);
      expect(polarEast.axisLabel).toBe('East (0°)');
      expect(polarEast.lengthPoints).toBe(100);
      // 100 pt / 72 * 25.4 * 100 scale = ~3527.78 mm
      expect(polarEast.lengthReal).toBeCloseTo(3527.78, 0);
      expect(polarEast.unit).toBe('mm');
    });

    it('identifies isometric axis at 30°', () => {
      const origin = { x: 100, y: 100 };
      // Screen space: +x = 86.6, -y = 50 (30° drafting angle)
      const target = { x: 186.6, y: 50 };
      const polar = computePolarTracking(origin, target);

      expect(polar.angleDeg).toBeCloseTo(30, 0);
      expect(polar.isIsometricAxis).toBe(true);
      expect(polar.axisLabel).toBe('ISO East (+30°)');
    });

    it('identifies vertical isometric and ortho axis at 90° (Up)', () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 20 }; // Screen -80y is drafting +90° Up
      const polar = computePolarTracking(origin, target);

      expect(polar.angleDeg).toBe(90);
      expect(polar.isIsometricAxis).toBe(true);
      expect(polar.isOrthoAxis).toBe(true);
      expect(polar.axisLabel).toBe('ISO Up (+90°)');
    });
  });
});
