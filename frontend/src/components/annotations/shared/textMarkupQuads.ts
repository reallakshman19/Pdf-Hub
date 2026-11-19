/** A supported, axis-aligned text-markup quadrilateral in local pixels. */
export interface TextMarkupQuadRect { x: number; y: number; width: number; height: number }

/**
 * The reader stores /QuadPoints as pairs normalized to the annotation Rect.
 * Accept either common corner ordering when the points form an axis-aligned
 * rectangle. Oriented line marks require the separate conservative check below.
 */
export function axisAlignedTextMarkupQuads(
  values: number[] | undefined,
  width: number,
  height: number,
  lineOrientation?: { pageRotation: number | undefined },
): TextMarkupQuadRect[] | null {
  // Bounds alone suffice for highlights. Underline-like marks have an oriented
  // baseline; /Rotate alone cannot distinguish arbitrary source artwork or
  // producer conventions, so restrict this preview to upright page-zero quads
  // whose first edge runs left-to-right along the displayed top.
  if (lineOrientation && (lineOrientation.pageRotation === undefined
    || ((lineOrientation.pageRotation % 360) + 360) % 360 !== 0)) return null;
  if (!Array.isArray(values) || values.length < 8 || values.length > 256 * 8 || values.length % 8 || !Number.isFinite(width)
    || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const result: TextMarkupQuadRect[] = [];
  for (let i = 0; i < values.length; i += 8) {
    const coordinates = values.slice(i, i + 8);
    // PDF geometry is untrusted. Out-of-Rect quads cannot be safely hit-tested
    // by this preview, and must not generate arbitrarily large path geometry.
    if (coordinates.some((n) => !Number.isFinite(n) || n < -1e-6 || n > 1 + 1e-6)) return null;
    const points = Array.from({ length: 4 }, (_, n) => ({ x: coordinates[2 * n] * width, y: coordinates[2 * n + 1] * height }));
    if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
    const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
    const left = Math.min(...xs); const right = Math.max(...xs);
    const top = Math.min(...ys); const bottom = Math.max(...ys);
    const w = right - left; const h = bottom - top;
    if (h <= 0 || w <= 0 || (lineOrientation && w <= h)) return null;
    const epsilonX = Math.max(w, 1) * 1e-6;
    const epsilonY = Math.max(h, 1) * 1e-6;
    if (lineOrientation && (Math.abs(points[0].y - top) > epsilonY
      || Math.abs(points[1].y - top) > epsilonY || points[0].x >= points[1].x)) return null;
    const corners = new Set<string>();
    for (const p of points) {
      const x = Math.abs(p.x - left) <= epsilonX ? 'l' : Math.abs(p.x - right) <= epsilonX ? 'r' : '';
      const y = Math.abs(p.y - top) <= epsilonY ? 't' : Math.abs(p.y - bottom) <= epsilonY ? 'b' : '';
      if (!x || !y) return null;
      corners.add(x + y);
    }
    if (corners.size !== 4) return null;
    result.push({ x: left, y: top, width: w, height: h });
  }
  return result;
}
