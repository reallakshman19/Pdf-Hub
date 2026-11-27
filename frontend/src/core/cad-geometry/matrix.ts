import type { AffineMatrix2D, Point2D } from './types';

export const IDENTITY_MATRIX: AffineMatrix2D = [1, 0, 0, 1, 0, 0];

/**
 * Transforms a 2D point using an affine transformation matrix [a, b, c, d, e, f].
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 */
export function transformPoint(point: Point2D, matrix: AffineMatrix2D): Point2D {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

/**
 * Multiplies two 2D affine transformation matrices: M = M1 * M2
 * Applying M to a point produces the same result as applying M1 then M2.
 * In PDF CTM semantics, when operator 'cm M' is executed:
 *   CTM_next = multiplyAffineMatrices(M, CTM_current)
 */
export function multiplyAffineMatrices(
  m1: AffineMatrix2D,
  m2: AffineMatrix2D,
): AffineMatrix2D {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/**
 * Computes the inverse of a 2D affine transformation matrix.
 * Returns null if the matrix is degenerate (det == 0).
 */
export function invertAffineMatrix(m: AffineMatrix2D): AffineMatrix2D | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1 / det;
  const a = m[3] * invDet;
  const b = -m[1] * invDet;
  const c = -m[2] * invDet;
  const d = m[0] * invDet;
  const e = (m[2] * m[5] - m[3] * m[4]) * invDet;
  const f = (m[1] * m[4] - m[0] * m[5]) * invDet;

  return [a, b, c, d, e, f];
}

/**
 * Creates a translation matrix.
 */
export function createTranslationMatrix(tx: number, ty: number): AffineMatrix2D {
  return [1, 0, 0, 1, tx, ty];
}

/**
 * Creates a scaling matrix.
 */
export function createScalingMatrix(sx: number, sy: number): AffineMatrix2D {
  return [sx, 0, 0, sy, 0, 0];
}

/**
 * Creates a rotation matrix (angle in radians).
 */
export function createRotationMatrix(angleRad: number): AffineMatrix2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [cos, sin, -sin, cos, 0, 0];
}
