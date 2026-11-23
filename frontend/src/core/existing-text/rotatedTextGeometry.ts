import type { ExistingTextTransform } from './types';

export interface DecomposedTransform {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDegrees: number; // 0..360, cardinal snapped if within tolerance
  readonly rawRotationDegrees: number;
  readonly translation: { readonly x: number; readonly y: number };
}

export interface RotatedWhiteoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotateDegrees: number;
}

export interface RotatedPoint {
  readonly x: number;
  readonly y: number;
}

export interface CssRotationStyle {
  readonly transform: string;
  readonly transformOrigin: string;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly isRotated: boolean;
}

/**
 * Snaps angles within tolerance of cardinal directions (0, 90, 180, 270, 360).
 */
export function snapRotationDegrees(deg: number, tolerance = 0.5): number {
  const normalized = ((deg % 360) + 360) % 360;
  if (Math.abs(normalized - 0) <= tolerance || Math.abs(normalized - 360) <= tolerance) return 0;
  if (Math.abs(normalized - 90) <= tolerance) return 90;
  if (Math.abs(normalized - 180) <= tolerance) return 180;
  if (Math.abs(normalized - 270) <= tolerance) return 270;
  return Number(normalized.toFixed(3));
}

/**
 * Decomposes a 6-element PDF transformation matrix [a, b, c, d, e, f]
 * into horizontal/vertical scale, rotation angle in degrees, and translation.
 */
export function decomposeTransform(transform: ExistingTextTransform): DecomposedTransform {
  const [a, b, c, d, e, f] = transform;
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);

  const angleRad = Math.atan2(b, a);
  const rawDegrees = ((angleRad * 180) / Math.PI + 360) % 360;
  const rotationDegrees = snapRotationDegrees(rawDegrees);

  return {
    scaleX: Number(scaleX.toFixed(4)),
    scaleY: Number(scaleY.toFixed(4)),
    rotationDegrees,
    rawRotationDegrees: Number(rawDegrees.toFixed(4)),
    translation: { x: e, y: f },
  };
}

/**
 * Computes the corner origin, dimensions, and rotation angle for a clearance
 * whiteout rectangle aligned with rotated text.
 * In PDF coordinates, page.drawRectangle rotates around (x, y) by rotateDegrees.
 */
export function computeRotatedWhiteoutRect(
  origin: RotatedPoint,
  advanceWidth: number,
  fontSize: number,
  rotationDegrees: number,
  padding = 2,
): RotatedWhiteoutRect {
  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const descenderOffset = fontSize * 0.25;
  const localX = -padding;
  const localY = -descenderOffset - padding;

  const worldX = origin.x + localX * cos - localY * sin;
  const worldY = origin.y + localX * sin + localY * cos;

  const width = advanceWidth + padding * 2;
  const height = fontSize * 1.25 + padding * 2;

  return {
    x: Number(worldX.toFixed(3)),
    y: Number(worldY.toFixed(3)),
    width: Number(width.toFixed(3)),
    height: Number(height.toFixed(3)),
    rotateDegrees: rotationDegrees,
  };
}

/**
 * Computes draw origin (x, y) when text has an alignment offset along its orientation vector.
 */
export function computeRotatedDrawOrigin(
  origin: RotatedPoint,
  xOffsetPt: number,
  rotationDegrees: number,
): RotatedPoint {
  if (Math.abs(xOffsetPt) < 0.001 || Math.abs(rotationDegrees) < 0.001) {
    return {
      x: Number((origin.x + xOffsetPt).toFixed(3)),
      y: Number(origin.y.toFixed(3)),
    };
  }

  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: Number((origin.x + xOffsetPt * cos).toFixed(3)),
    y: Number((origin.y + xOffsetPt * sin).toFixed(3)),
  };
}

/**
 * Computes CSS transform styling for the in-situ canvas inline text editor.
 */
export function computeCssRotationTransform(
  rotationDegrees: number,
  bounds: { left: number; top: number; width: number; height: number },
): CssRotationStyle {
  const isRotated = Math.abs(rotationDegrees) > 0.5 && Math.abs(rotationDegrees - 360) > 0.5;

  if (!isRotated) {
    return {
      transform: 'none',
      transformOrigin: '0% 0%',
      width: Math.max(bounds.width + 12, 80),
      height: Math.max(bounds.height + 6, 24),
      left: bounds.left - 4,
      top: bounds.top - 3,
      isRotated: false,
    };
  }

  // In HTML/CSS screen coordinates, Y points down while in PDF user space Y points up.
  // A counter-clockwise rotation of theta in PDF user space corresponds to
  // rotate(-theta deg) in screen space.
  return {
    transform: `rotate(${-rotationDegrees}deg)`,
    transformOrigin: '0% 0%',
    width: Math.max(bounds.width + 12, 80),
    height: Math.max(bounds.height + 6, 24),
    left: bounds.left,
    top: bounds.top,
    isRotated: true,
  };
}
