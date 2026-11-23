import { describe, it, expect } from 'vitest';
import {
  decomposeTransform,
  snapRotationDegrees,
  computeRotatedWhiteoutRect,
  computeRotatedDrawOrigin,
  computeCssRotationTransform,
} from '../rotatedTextGeometry';

describe('rotatedTextGeometry', () => {
  it('decomposes standard cardinal transformation matrices accurately', () => {
    // 0 degrees
    const t0 = decomposeTransform([12, 0, 0, 12, 100, 200]);
    expect(t0.scaleX).toBe(12);
    expect(t0.scaleY).toBe(12);
    expect(t0.rotationDegrees).toBe(0);
    expect(t0.translation).toEqual({ x: 100, y: 200 });

    // 90 degrees: [0, 12, -12, 0, 100, 200]
    const t90 = decomposeTransform([0, 12, -12, 0, 100, 200]);
    expect(t90.scaleX).toBe(12);
    expect(t90.scaleY).toBe(12);
    expect(t90.rotationDegrees).toBe(90);

    // 180 degrees: [-12, 0, 0, -12, 100, 200]
    const t180 = decomposeTransform([-12, 0, 0, -12, 100, 200]);
    expect(t180.scaleX).toBe(12);
    expect(t180.scaleY).toBe(12);
    expect(t180.rotationDegrees).toBe(180);

    // 270 degrees: [0, -12, 12, 0, 100, 200]
    const t270 = decomposeTransform([0, -12, 12, 0, 100, 200]);
    expect(t270.scaleX).toBe(12);
    expect(t270.scaleY).toBe(12);
    expect(t270.rotationDegrees).toBe(270);
  });

  it('decomposes arbitrary angle matrices (e.g. 45 degrees diagonal)', () => {
    const rad45 = (45 * Math.PI) / 180;
    const a = 10 * Math.cos(rad45);
    const b = 10 * Math.sin(rad45);
    const c = -10 * Math.sin(rad45);
    const d = 10 * Math.cos(rad45);

    const t45 = decomposeTransform([a, b, c, d, 50, 75]);
    expect(t45.scaleX).toBe(10);
    expect(t45.scaleY).toBe(10);
    expect(t45.rotationDegrees).toBe(45);
    expect(t45.translation).toEqual({ x: 50, y: 75 });
  });

  it('snaps near-cardinal angles within 0.5 degrees tolerance and preserves non-cardinal angles', () => {
    expect(snapRotationDegrees(89.8)).toBe(90);
    expect(snapRotationDegrees(90.3)).toBe(90);
    expect(snapRotationDegrees(179.7)).toBe(180);
    expect(snapRotationDegrees(270.4)).toBe(270);
    expect(snapRotationDegrees(0.2)).toBe(0);
    expect(snapRotationDegrees(359.8)).toBe(0);

    // Non-cardinal angles retained
    expect(snapRotationDegrees(45.2)).toBe(45.2);
    expect(snapRotationDegrees(30.0)).toBe(30);
  });

  it('computes rotated whiteout rect origin and dimensions', () => {
    const origin = { x: 100, y: 200 };
    const width = 80;
    const fontSize = 12;
    const padding = 2;

    // 0 deg
    const r0 = computeRotatedWhiteoutRect(origin, width, fontSize, 0, padding);
    expect(r0.x).toBe(98); // 100 - 2
    expect(r0.y).toBe(195); // 200 - 3 - 2
    expect(r0.width).toBe(84); // 80 + 4
    expect(r0.height).toBe(19); // 15 + 4
    expect(r0.rotateDegrees).toBe(0);

    // 90 deg
    const r90 = computeRotatedWhiteoutRect(origin, width, fontSize, 90, padding);
    // At 90 deg: localX = -2, localY = -5
    // worldX = 100 + (-2)*0 - (-5)*1 = 105
    // worldY = 200 + (-2)*1 + (-5)*0 = 198
    expect(r90.x).toBe(105);
    expect(r90.y).toBe(198);
    expect(r90.rotateDegrees).toBe(90);
  });

  it('computes rotated draw origin along the text angle vector', () => {
    const origin = { x: 100, y: 200 };
    const offset = 20;

    // 0 deg: along +X
    const o0 = computeRotatedDrawOrigin(origin, offset, 0);
    expect(o0).toEqual({ x: 120, y: 200 });

    // 90 deg: along +Y
    const o90 = computeRotatedDrawOrigin(origin, offset, 90);
    expect(o90.x).toBe(100);
    expect(o90.y).toBe(220);

    // 180 deg: along -X
    const o180 = computeRotatedDrawOrigin(origin, offset, 180);
    expect(o180.x).toBe(80);
    expect(o180.y).toBe(200);

    // 270 deg: along -Y
    const o270 = computeRotatedDrawOrigin(origin, offset, 270);
    expect(o270.x).toBe(100);
    expect(o270.y).toBe(180);
  });

  it('computes CSS rotation transform for the canvas inline editor', () => {
    const bounds = { left: 50, top: 100, width: 60, height: 16 };

    // 0 deg: non-rotated
    const css0 = computeCssRotationTransform(0, bounds);
    expect(css0.isRotated).toBe(false);
    expect(css0.transform).toBe('none');

    // 90 deg: rotated
    const css90 = computeCssRotationTransform(90, bounds);
    expect(css90.isRotated).toBe(true);
    expect(css90.transform).toBe('rotate(-90deg)');
    expect(css90.transformOrigin).toBe('0% 0%');

    // 270 deg: rotated
    const css270 = computeCssRotationTransform(270, bounds);
    expect(css270.isRotated).toBe(true);
    expect(css270.transform).toBe('rotate(-270deg)');
  });
});
