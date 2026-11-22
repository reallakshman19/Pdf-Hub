import { MAX_PREVIEW_MARKUP_QUADS } from '../../../core/annotations/squigglyGeometry';

/** A supported, axis-aligned text-markup quadrilateral in local pixels. */
export interface TextMarkupQuadRect { x: number; y: number; width: number; height: number }

/** A validated top-left-first text quad in its local, upright coordinate system. */
export interface OrientedTextMarkupQuad extends TextMarkupQuadRect { angle: number }

/**
 * A native source's durable turn and the current unsaved turn are relative to
 * the displayed page. Only source-backed, integral quarter turns are usable.
 */
export function textMarkupPreviewRotation(
  pageRotation: number | undefined,
  sourceHash: string | undefined,
  persistedTurns: number | undefined,
  pendingTurn: { turns: number; sourceHash: string } | undefined,
  draft?: { basisRotation: number; turns: number },
): number | undefined {
  if (pageRotation === undefined || !Number.isFinite(pageRotation)) return undefined;
  if (draft !== undefined) {
    if (!draft || typeof draft !== 'object' || sourceHash || persistedTurns !== undefined || pendingTurn !== undefined
      || ![0, 90, 180, 270].includes(draft.basisRotation)
      || !Number.isInteger(draft.turns) || draft.turns < 0 || draft.turns > 3) return undefined;
    return ((pageRotation - draft.basisRotation + draft.turns * 90) % 360 + 360) % 360;
  }
  const validHash = typeof sourceHash === 'string' && sourceHash.length > 0;
  if (persistedTurns !== undefined && (!validHash || !Number.isInteger(persistedTurns) || persistedTurns < 0 || persistedTurns > 3)) return undefined;
  if (pendingTurn !== undefined && (!pendingTurn || !validHash || pendingTurn.sourceHash !== sourceHash
    || !Number.isInteger(pendingTurn.turns) || pendingTurn.turns < 1 || pendingTurn.turns > 3)) return undefined;
  return ((pageRotation + ((persistedTurns ?? 0) + (pendingTurn?.turns ?? 0)) * 90) % 360 + 360) % 360;
}

/**
 * Preview a limited subset of native quads: rectangular, top-edge-first text
 * whose orientation follows the page. Other orders and directions are
 * ambiguous and must use the existing approximate fallback.
 */
export function orientedTextMarkupQuads(
  values: number[] | undefined,
  width: number,
  height: number,
  pageRotation: number | undefined,
  knownGenerated = false,
): OrientedTextMarkupQuad[] | null {
  if (pageRotation === undefined || !Number.isFinite(pageRotation)) return null;
  const angle = ((pageRotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(angle)) return null;
  const rects = axisAlignedTextMarkupQuads(values, width, height);
  if (!rects || !values) return null;
  const result: OrientedTextMarkupQuad[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const first = { x: values[i * 8] * width, y: values[i * 8 + 1] * height };
    const second = { x: values[i * 8 + 2] * width, y: values[i * 8 + 3] * height };
    const right = rect.x + rect.width; const bottom = rect.y + rect.height;
    const expected = angle === 0 ? [rect.x, rect.y, right, rect.y]
      : angle === 90 ? [right, rect.y, right, bottom]
        : angle === 180 ? [right, bottom, rect.x, bottom]
          : [rect.x, bottom, rect.x, rect.y];
    const epsilonX = Math.min(Math.max(rect.width, 1) * 1e-6, rect.width / 4);
    const epsilonY = Math.min(Math.max(rect.height, 1) * 1e-6, rect.height / 4);
    if ([first.x, first.y, second.x, second.y].some((n, index) =>
      Math.abs(n - expected[index]) > (index % 2 === 0 ? epsilonX : epsilonY))) return null;
    const along = angle % 180 === 0 ? rect.width : rect.height;
    const across = angle % 180 === 0 ? rect.height : rect.width;
    if (!knownGenerated && along <= across) return null;
    result.push({ x: first.x, y: first.y, width: along, height: across, angle });
  }
  return result;
}

/** Drafts have no source appearance. Saved state must be rederived from the PDF. */
export function hasKnownMarkupOrientation(data: {
  nativeMarkupDraft?: { basisRotation: number; turns: number };
  nativeMarkupGeneratedAppearance?: boolean;
  nativeMarkupRotationSourceHash?: string;
  nativeMarkupTurn?: { turns: number; sourceHash: string };
  nativeMarkupPreviewOffset?: number;
  nativeSourceRef?: string;
  nativeOriginalName?: string;
  nativeCopySource?: { requiresSource?: boolean };
}): boolean {
  const draft = data.nativeMarkupDraft;
  const fresh = Boolean(draft && typeof draft === 'object'
    && !data.nativeSourceRef && !data.nativeOriginalName && !data.nativeCopySource?.requiresSource
    && !data.nativeMarkupRotationSourceHash && !data.nativeMarkupTurn
    && data.nativeMarkupPreviewOffset === undefined
    && [0, 90, 180, 270].includes(draft.basisRotation)
    && Number.isInteger(draft.turns) && draft.turns >= 0 && draft.turns <= 3);
  return fresh || (data.nativeMarkupGeneratedAppearance === true
    && typeof data.nativeMarkupRotationSourceHash === 'string' && data.nativeMarkupRotationSourceHash.length > 0);
}

/** Transform local upright quad coordinates into displayed page coordinates. */
export function pointOnTextMarkupQuad(quad: OrientedTextMarkupQuad, x: number, y: number): { x: number; y: number } {
  if (quad.angle === 90) return { x: quad.x - y, y: quad.y + x };
  if (quad.angle === 180) return { x: quad.x - x, y: quad.y - y };
  if (quad.angle === 270) return { x: quad.x + y, y: quad.y - x };
  return { x: quad.x + x, y: quad.y + y };
}

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
  if (!Array.isArray(values) || values.length < 8 || values.length > MAX_PREVIEW_MARKUP_QUADS * 8 || values.length % 8 || !Number.isFinite(width)
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
