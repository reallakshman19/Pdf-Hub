import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  applyGridSnap,
  applyOrthoConstraint,
  applyPolarTracking,
  findNearestObjectSnap,
  computeDraftingTelemetry,
} from '../draftingMath';
import { useCadModelingStore } from '../store';
import { ContinuousModelingHud } from '@/components/cad/ContinuousModelingHud';
import type { CadArcPrimitive, CadLineSegment } from '@/core/cad-geometry/types';

describe('CAD Continuous Modeling HUD & Tool Store - Mini-Phase P.1', () => {
  beforeEach(() => {
    useCadModelingStore.getState().reset();
  });

  describe('FALSIFY-HUD-01: Drafting Math Constraints', () => {
    it('applies grid snap to integer multiples of spacing', () => {
      const pt = { x: 23.4, y: 58.7 };
      const snapped10 = applyGridSnap(pt, 10);
      expect(snapped10).toEqual({ x: 20, y: 60 });

      const snapped25 = applyGridSnap(pt, 25);
      expect(snapped25).toEqual({ x: 25, y: 50 });
    });

    it('constrains movement to horizontal or vertical axis in Ortho mode', () => {
      const anchor = { x: 100, y: 100 };

      // Dominant X movement (dx=80 > dy=20) -> snaps Y to anchor.y
      const ptHoriz = { x: 180, y: 120 };
      expect(applyOrthoConstraint(anchor, ptHoriz)).toEqual({ x: 180, y: 100 });

      // Dominant Y movement (dy=90 > dx=10) -> snaps X to anchor.x
      const ptVert = { x: 110, y: 190 };
      expect(applyOrthoConstraint(anchor, ptVert)).toEqual({ x: 100, y: 190 });
    });

    it('snaps cursor to nearest polar ray within threshold angle', () => {
      const anchor = { x: 0, y: 0 };
      // Point at length 100, angle ~46 deg (close to 45 deg)
      const rad46 = (46 * Math.PI) / 180;
      const ptNear45 = { x: 100 * Math.cos(rad46), y: 100 * Math.sin(rad46) };

      const res = applyPolarTracking(anchor, ptNear45, 45, 4.0);
      expect(res.snappedAngleDeg).toBe(45);
      expect(res.point.x).toBeCloseTo(100 * Math.cos(Math.PI / 4), 1);
      expect(res.point.y).toBeCloseTo(100 * Math.sin(Math.PI / 4), 1);

      // Point at angle 60 deg (far from 45 deg) does not snap
      const rad60 = (60 * Math.PI) / 180;
      const pt60 = { x: 100 * Math.cos(rad60), y: 100 * Math.sin(rad60) };
      const resFar = applyPolarTracking(anchor, pt60, 45, 4.0);
      expect(resFar.snappedAngleDeg).toBeNull();
    });
  });

  describe('FALSIFY-HUD-02: Object Snap Hierarchy', () => {
    it('prioritizes endpoints over midpoints and finds arc centers within tolerance', () => {
      const lines: CadLineSegment[] = [
        {
          id: 'l1',
          start: { x: 0, y: 0 },
          end: { x: 100, y: 0 },
          length: 100,
        },
      ];
      const arcs: CadArcPrimitive[] = [
        {
          id: 'a1',
          center: { x: 200, y: 200 },
          radius: 30,
          startAngleRad: 0,
          endAngleRad: Math.PI,
          isCounterClockwise: true,
        },
      ];

      // Near endpoint (0, 0)
      const snapNearStart = findNearestObjectSnap({ x: 2, y: 3 }, lines, arcs, 8);
      expect(snapNearStart).not.toBeNull();
      expect(snapNearStart?.type).toBe('endpoint');
      expect(snapNearStart?.point).toEqual({ x: 0, y: 0 });

      // Near midpoint (50, 0)
      const snapNearMid = findNearestObjectSnap({ x: 51, y: 2 }, lines, arcs, 8);
      expect(snapNearMid).not.toBeNull();
      expect(snapNearMid?.type).toBe('midpoint');
      expect(snapNearMid?.point).toEqual({ x: 50, y: 0 });

      // Near arc center (200, 200)
      const snapNearCenter = findNearestObjectSnap({ x: 203, y: 198 }, lines, arcs, 8);
      expect(snapNearCenter).not.toBeNull();
      expect(snapNearCenter?.type).toBe('center');
      expect(snapNearCenter?.point).toEqual({ x: 200, y: 200 });

      // Far away
      const snapFar = findNearestObjectSnap({ x: 500, y: 500 }, lines, arcs, 8);
      expect(snapFar).toBeNull();
    });
  });

  describe('FALSIFY-HUD-03: Store State Transitions & Mutual Exclusion', () => {
    it('enforces mutual exclusion between Ortho and Polar tracking modes', () => {
      const store = useCadModelingStore.getState();

      // Initially polar is true, ortho is false
      expect(store.drafting.polarTrackingEnabled).toBe(true);
      expect(store.drafting.orthoEnabled).toBe(false);

      // Toggling ortho turns ortho ON and polar OFF
      store.toggleOrtho();
      let state = useCadModelingStore.getState();
      expect(state.drafting.orthoEnabled).toBe(true);
      expect(state.drafting.polarTrackingEnabled).toBe(false);

      // Toggling polar turns polar ON and ortho OFF
      store.togglePolarTracking();
      state = useCadModelingStore.getState();
      expect(state.drafting.polarTrackingEnabled).toBe(true);
      expect(state.drafting.orthoEnabled).toBe(false);
    });

    it('toggles grid, snap, object snap, and 3D dock state correctly', () => {
      const store = useCadModelingStore.getState();

      store.toggleGridVisible();
      expect(useCadModelingStore.getState().drafting.gridVisible).toBe(false);

      store.toggleGridSnap();
      expect(useCadModelingStore.getState().drafting.gridSnapEnabled).toBe(true);

      store.toggleObjectSnap();
      expect(useCadModelingStore.getState().drafting.objectSnapEnabled).toBe(false);

      store.toggle3DDock();
      expect(useCadModelingStore.getState().dock3d.isOpen).toBe(true);
    });
  });

  describe('FALSIFY-HUD-04: Live Telemetry Readout & Polar Vector Computation', () => {
    it('computes exact Euclidean length and angle from active anchor to cursor', () => {
      const store = useCadModelingStore.getState();

      store.setActiveAnchor({ x: 10, y: 10 });
      store.updateCursor({ world: { x: 40, y: 50 } }); // dx=30, dy=40 -> length=50

      const state = useCadModelingStore.getState();
      expect(state.telemetry.activeLength).toBeCloseTo(50);
      expect(state.telemetry.activeAngleDeg).toBeCloseTo(53.1, 1);

      // Direct math test
      const t = computeDraftingTelemetry({ x: 0, y: 0 }, { x: 0, y: 20 });
      expect(t.length).toBe(20);
      expect(t.angleDeg).toBe(90);
    });
  });

  describe('FALSIFY-HUD-05: HUD Component Rendering & Keyboard Shortcuts', () => {
    it('renders coordinates, buttons, and updates state on keyboard shortcuts', () => {
      render(<ContinuousModelingHud />);

      expect(screen.getByTestId('cad-continuous-modeling-hud')).toBeDefined();
      expect(screen.getByTestId('hud-coordinates')).toBeDefined();
      expect(screen.getByTestId('hud-toggle-grid')).toBeDefined();
      expect(screen.getByTestId('hud-toggle-ortho')).toBeDefined();
      expect(screen.getByTestId('hud-toggle-polar')).toBeDefined();
      expect(screen.getByTestId('hud-toggle-osnap')).toBeDefined();
      expect(screen.getByTestId('hud-toggle-3d-dock')).toBeDefined();

      // Press F8 -> toggles Ortho
      fireEvent.keyDown(window, { key: 'F8' });
      expect(useCadModelingStore.getState().drafting.orthoEnabled).toBe(true);

      // Press F7 -> toggles Grid Visible
      fireEvent.keyDown(window, { key: 'F7' });
      expect(useCadModelingStore.getState().drafting.gridVisible).toBe(false);

      // Press Ctrl+3 -> toggles 3D Dock
      fireEvent.keyDown(window, { key: '3', ctrlKey: true });
      expect(useCadModelingStore.getState().dock3d.isOpen).toBe(true);
    });

    it('renders polar readout when anchor and cursor are active', () => {
      useCadModelingStore.getState().setActiveAnchor({ x: 0, y: 0 });
      useCadModelingStore.getState().updateCursor({ world: { x: 100, y: 0 } });

      render(<ContinuousModelingHud />);
      const polar = screen.getByTestId('hud-polar-readout');
      expect(polar).toBeDefined();
      expect(polar.textContent).toContain('100.00');
      expect(polar.textContent).toContain('0.0°');
    });

    it('renders snap badge when activeSnapType is present', () => {
      useCadModelingStore.getState().setSnappedState({ x: 50, y: 50 }, 'endpoint');

      render(<ContinuousModelingHud />);
      const badge = screen.getByTestId('hud-snap-badge');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('endpoint');
    });
  });
});
