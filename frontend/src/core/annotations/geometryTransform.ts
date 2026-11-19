import type { AnnotationData, PdfAnnotation, Rect } from './types';

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

  // Moving a callout moves its complete leader, while resizing its body leaves
  // the anchor and knee in place. Explicitly supplied leader edits win.
  if (previous.width === nextRect.width && previous.height === nextRect.height) {
    const dx = nextRect.x - previous.x;
    const dy = nextRect.y - previous.y;
    if (annotation.data.anchor && nextData.anchor === annotation.data.anchor) {
      replace({ anchor: { x: annotation.data.anchor.x + dx, y: annotation.data.anchor.y + dy } });
    }
    if (annotation.data.knee && nextData.knee === annotation.data.knee) {
      replace({ knee: { x: annotation.data.knee.x + dx, y: annotation.data.knee.y + dy } });
    }
  }
  return result;
}
