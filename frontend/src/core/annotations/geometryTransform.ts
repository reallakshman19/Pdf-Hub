import type { AnnotationData, PdfAnnotation, Rect } from './types';

type NativeMarkupRotationData = AnnotationData & {
  nativeMarkupRotationSourceHash?: string;
  nativeMarkupTurn?: { turns: number; sourceHash: string };
};

/** Initialize geometry only when the application creates a fresh markup. */
export function initializeMarkupDraft(annotation: PdfAnnotation, pageRotation: number): PdfAnnotation {
  if (!['highlight', 'underline', 'strikeout', 'squiggly', 'redaction'].includes(annotation.type)
    || ![0, 90, 180, 270].includes(pageRotation)) return annotation;
  const data: AnnotationData = { ...annotation.data, nativeMarkupDraft: { basisRotation: pageRotation, turns: 0 } };
  if (annotation.type !== 'redaction' && !data.textMarkupQuads) data.textMarkupQuads = [0, 0, 1, 0, 0, 1, 1, 1];
  return { ...annotation, data };
}

/**
 * Rotate supported native markup in displayed page coordinates. Authorization
 * here is only a UI hint; the writer must revalidate the actual source PDF.
 */
export function rotateMarkupQuarterTurn(annotation: PdfAnnotation): Partial<PdfAnnotation> | null {
  if (!['highlight', 'underline', 'strikeout', 'squiggly', 'redaction'].includes(annotation.type)) return null;
  const sourceData = annotation.data as NativeMarkupRotationData;
  const hash = sourceData.nativeMarkupRotationSourceHash;
  const prior = sourceData.nativeMarkupTurn;
  const draft = sourceData.nativeMarkupDraft;
  const validDraft = Boolean(draft && !hash && !prior && !sourceData.nativeSourceRef && !sourceData.nativeOriginalName
    && !sourceData.nativeCopySource?.requiresSource && [0, 90, 180, 270].includes(draft.basisRotation)
    && Number.isInteger(draft.turns) && draft.turns >= 0 && draft.turns <= 3);
  // An unresolved copy of native artwork needs separate writer handling.
  if (sourceData.nativeIdentityAmbiguous || (!validDraft && (!hash || draft !== undefined || sourceData.nativeCopySource))) return null;
  if (prior && (prior.sourceHash !== hash || !Number.isInteger(prior.turns) || prior.turns < 1 || prior.turns > 3)) return null;
  const { x, y, width, height } = annotation.rect;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const rect = { x: x + (width - height) / 2, y: y + (height - width) / 2, width: height, height: width };
  if (!Object.values(rect).every(Number.isFinite)) return null;

  const quads = sourceData.textMarkupQuads;
  if (annotation.type === 'redaction') {
    if (quads !== undefined) return null;
  } else {
    if (!Array.isArray(quads) || quads.length < 8 || quads.length > 256 * 8 || quads.length % 8
      || quads.some((value) => !Number.isFinite(value) || value < -1e-6 || value > 1 + 1e-6)) return null;
    // Support both common PDF point orders, but do not enable rotation for a
    // collapsed or concave quad with unknown semantics.
    for (let i = 0; i < quads.length; i += 8) {
      const points = Array.from({ length: 4 }, (_, j) => ({ x: quads[i + j * 2], y: quads[i + j * 2 + 1] }));
      const convex = (indices: number[]) => {
        const cross = indices.map((index, j) => {
          const a = points[index]; const b = points[indices[(j + 1) % 4]]; const c = points[indices[(j + 2) % 4]];
          return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        });
        return cross.every((v) => v > 1e-12) || cross.every((v) => v < -1e-12);
      };
      if (!convex([0, 1, 2, 3]) && !convex([0, 1, 3, 2])) return null;
    }
  }

  const data: NativeMarkupRotationData = { ...sourceData };
  if (quads) data.textMarkupQuads = quads.map((_value, index) => index % 2 === 0 ? 1 - quads[index + 1] : quads[index - 1]);
  if (validDraft && draft) {
    data.nativeMarkupDraft = { ...draft, turns: (draft.turns + 1) % 4 };
  } else {
    const turns = ((prior?.turns ?? 0) + 1) % 4;
    if (turns && hash) data.nativeMarkupTurn = { turns, sourceHash: hash };
    else delete data.nativeMarkupTurn;
  }
  delete data.normalizedGeometry;
  delete data.geometryVersion;
  return { rect, data };
}

/** Rotate a square/circle annotation and its selection box as one undoable edit. */
export function rotateBoxShapeQuarterTurn(annotation: PdfAnnotation): Partial<PdfAnnotation> | null {
  if (annotation.type !== 'shape-rect' && annotation.type !== 'shape-ellipse' && annotation.type !== 'shape-cloud') return null;
  const { x, y, width, height } = annotation.rect;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const prior = annotation.data.nativeBoxShapeTurn;
  const hash = prior?.sourceHash ?? annotation.data.nativeBoxShapeSourceHash;
  // Clouds have no app-generated AP yet: only a source-backed, validated
  // native appearance can be transformed without inventing artwork.
  if (annotation.type === 'shape-cloud' && (!annotation.data.nativeBoxShapeImported || !annotation.data.nativeBoxShapeHasAppearance || !hash)) return null;
  if (annotation.data.nativeBoxShapeImported && (!hash || hash !== annotation.data.nativeBoxShapeSourceHash)) return null;
  const previous = prior?.turns ?? 0;
  if (!Number.isInteger(previous) || previous < 0 || previous > 3) return null;
  const turns = (previous + 1) % 4;
  const data = { ...annotation.data };
  if (turns) data.nativeBoxShapeTurn = { turns, ...(hash ? { sourceHash: hash } : {}) };
  else delete data.nativeBoxShapeTurn;
  delete data.normalizedGeometry;
  delete data.geometryVersion;
  const cx = x + width / 2; const cy = y + height / 2;
  return { rect: { x: cx - height / 2, y: cy - width / 2, width: height, height: width }, data };
}

/** Rotate a polygon in screen/page coordinates about its current center. */
export function rotatePolygonQuarterTurn(annotation: PdfAnnotation): Partial<PdfAnnotation> | null {
  if (annotation.type !== 'shape-polygon') return null;
  const { x, y, width, height } = annotation.rect;
  const points = annotation.data.points;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0
    || !points || points.length < 6 || points.length % 2 || !points.every(Number.isFinite)) return null;
  const cx = x + width / 2; const cy = y + height / 2;
  const rotated: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    rotated.push(cx - (points[i + 1] - cy), cy + (points[i] - cx));
  }
  const data = { ...annotation.data, points: rotated } as AnnotationData & { nativePolygonQuarterTurns?: number };
  const previous = data.nativePolygonQuarterTurns ?? 0;
  if (!Number.isInteger(previous) || previous < 0 || previous > 3) return null;
  const turns = (previous + 1) % 4;
  if (turns) data.nativePolygonQuarterTurns = turns;
  else delete data.nativePolygonQuarterTurns;
  // Cached normalized geometry describes the old rectangle and vertices.
  delete data.normalizedGeometry;
  delete data.geometryVersion;
  return { rect: { x: cx - height / 2, y: cy - width / 2, width: height, height: width }, data };
}

/** Rotate every stroke in page space with its selection rectangle. */
export function rotateInkQuarterTurn(annotation: PdfAnnotation): Partial<PdfAnnotation> | null {
  if (annotation.type !== 'ink') return null;
  const { x, y, width, height } = annotation.rect;
  const paths = annotation.data.paths;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0
    || !paths?.length || paths.some((path) => !Array.isArray(path) || path.length < 4 || path.length % 2 || !path.every(Number.isFinite)
      || !path.some((value, i) => i % 2 === 0 && (value !== path[0] || path[i + 1] !== path[1])))) return null;
  const cx = x + width / 2; const cy = y + height / 2;
  const rotated = paths.map((path) => {
    const result: number[] = [];
    for (let i = 0; i < path.length; i += 2) result.push(cx - (path[i + 1] - cy), cy + (path[i] - cx));
    return result;
  });
  const data = { ...annotation.data, paths: rotated } as AnnotationData & { nativeInkQuarterTurns?: number };
  const previous = data.nativeInkQuarterTurns ?? 0;
  if (!Number.isInteger(previous) || previous < 0 || previous > 3) return null;
  const turns = (previous + 1) % 4;
  if (turns) data.nativeInkQuarterTurns = turns;
  else delete data.nativeInkQuarterTurns;
  delete data.normalizedGeometry;
  delete data.geometryVersion;
  return { rect: { x: cx - height / 2, y: cy - width / 2, width: height, height: width }, data };
}

/** Rotate the ordered endpoints of a line in page space about its center. */
export function rotateLineQuarterTurn(annotation: PdfAnnotation): Partial<PdfAnnotation> | null {
  if (annotation.type !== 'line' && annotation.type !== 'arrow') return null;
  const { x, y, width, height } = annotation.rect; const points = annotation.data.points;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || !points || points.length !== 4
    || !points.every(Number.isFinite) || (points[0] === points[2] && points[1] === points[3])) return null;
  const cx = x + width / 2; const cy = y + height / 2;
  const rect = { x: cx - height / 2, y: cy - width / 2, width: height, height: width };
  const rotated: number[] = [];
  for (let i = 0; i < 4; i += 2) rotated.push(cx - (y + points[i + 1] - cy) - rect.x, cy + (x + points[i] - cx) - rect.y);
  const data = { ...annotation.data, points: rotated } as AnnotationData & { nativeLineQuarterTurns?: number };
  const previous = data.nativeLineQuarterTurns ?? 0;
  if (!Number.isInteger(previous) || previous < 0 || previous > 3) return null;
  const turns = (previous + 1) % 4;
  if (turns) data.nativeLineQuarterTurns = turns;
  else delete data.nativeLineQuarterTurns;
  delete data.normalizedGeometry;
  delete data.geometryVersion;
  return { rect, data };
}

/** Keep page-space geometry attached to its rectangle when it is moved or resized. */
export function remapAnnotationGeometry(
  annotation: PdfAnnotation,
  nextRect: Rect,
  nextData: AnnotationData = annotation.data,
): AnnotationData {
  const previous = annotation.rect;
  if (previous.x === nextRect.x && previous.y === nextRect.y
    && previous.width === nextRect.width && previous.height === nextRect.height) return nextData;

  const mapX = (x: number) => nextRect.x + (previous.width ? (x - previous.x) * nextRect.width / previous.width : x - previous.x);
  const mapY = (y: number) => nextRect.y + (previous.height ? (y - previous.y) * nextRect.height / previous.height : y - previous.y);
  const mapPairs = (values: number[]) => values.map((value, index) => index % 2 ? mapY(value) : mapX(value));
  let result = nextData;
  const replace = (patch: Partial<AnnotationData>) => { result = { ...result, ...patch }; };

  // Line and arrow points are relative to the rectangle; polygon points and
  // ink paths are absolute page coordinates. Explicit point edits win.
  if (annotation.type === 'shape-polygon' && annotation.data.points
    && nextData.points === annotation.data.points) replace({ points: mapPairs(annotation.data.points) });
  if (annotation.type === 'ink' && annotation.data.paths
    && nextData.paths === annotation.data.paths) replace({ paths: annotation.data.paths.map(mapPairs) });

  return result;
}
