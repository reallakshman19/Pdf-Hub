import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import { getAnnotationPageVertices } from '@/core/annotations/pointsSpace';
import type { CadClosedLoop, CadLineSegment } from '@/core/cad-geometry/types';
import {
  buildPlanarGraph,
  computeSignedPolygonArea,
  extractClosedLoops,
} from '@/core/cad-geometry/planarGraph';

function buildLoopFromPolygon(id: string, rawPoints: Point2D[]): CadClosedLoop | null {
  if (rawPoints.length < 3) return null;

  const signedArea = computeSignedPolygonArea(rawPoints);
  if (Math.abs(signedArea) <= 1e-2) return null;

  // Ensure Counter-Clockwise ordering for extrusion outward normals
  const vertices = signedArea < 0 ? [...rawPoints].reverse() : [...rawPoints];
  const area = Math.abs(signedArea);

  let perimeter = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cxSum = 0;
  let cySum = 0;

  for (let i = 0; i < vertices.length; i += 1) {
    const pt = vertices[i];
    const nextPt = vertices[(i + 1) % vertices.length];
    perimeter += Math.hypot(nextPt.x - pt.x, nextPt.y - pt.y);
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;

    const cross = pt.x * nextPt.y - nextPt.x * pt.y;
    cxSum += (pt.x + nextPt.x) * cross;
    cySum += (pt.y + nextPt.y) * cross;
  }

  const posSigned = Math.abs(signedArea);
  return {
    id,
    vertices,
    area,
    perimeter,
    centroid: {
      x: cxSum / (6 * posSigned),
      y: cySum / (6 * posSigned),
    },
    isClockwise: false,
    bounds: { minX, minY, maxX, maxY },
    edgeIds: [id],
  };
}

/**
 * Extracts closed 2D CAD loops from page annotations:
 *  - Rectangle shapes (`shape-rect`)
 *  - Polygons (`shape-polygon`)
 *  - Closed faces formed by intersecting `line` / `arrow` segments via DCEL planar graph
 */
export function harvestLoopsFromAnnotations(annotations: PdfAnnotation[]): CadClosedLoop[] {
  const loops: CadClosedLoop[] = [];
  const segments: CadLineSegment[] = [];

  for (const ann of annotations) {
    if (ann.type === 'shape-rect' && ann.rect.width > 1 && ann.rect.height > 1) {
      const { x, y, width, height } = ann.rect;
      const loop = buildLoopFromPolygon(`rect-${ann.id}`, [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ]);
      if (loop) loops.push(loop);
      continue;
    }

    if (ann.type === 'shape-polygon' || ann.type === 'area-takeoff') {
      const polyPts = ann.data.polygonPoints as Point2D[] | undefined;
      let pts: Point2D[] = [];
      if (polyPts && polyPts.length >= 3) {
        pts = polyPts;
      } else {
        pts = getAnnotationPageVertices(ann);
      }
      const loop = buildLoopFromPolygon(`poly-${ann.id}`, pts);
      if (loop) loops.push(loop);
      continue;
    }

    if (ann.type === 'line' || ann.type === 'arrow' || ann.type === 'perimeter-takeoff') {
      const verts = getAnnotationPageVertices(ann);
      if (verts.length >= 2) {
        for (let i = 0; i < verts.length - 1; i += 1) {
          const p1 = verts[i];
          const p2 = verts[i + 1];
          const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (length > 1) {
            segments.push({
              id: verts.length === 2 ? ann.id : `${ann.id}-seg-${i}`,
              start: p1,
              end: p2,
              length,
            });
          }
        }
        continue;
      }
      const start = ann.data.startPoint as Point2D | undefined;
      const end = ann.data.endPoint as Point2D | undefined;
      const x1 = start ? start.x : (typeof ann.data.x1 === 'number' ? ann.data.x1 : ann.rect.x);
      const y1 = start ? start.y : (typeof ann.data.y1 === 'number' ? ann.data.y1 : ann.rect.y);
      const x2 = end ? end.x : (typeof ann.data.x2 === 'number' ? ann.data.x2 : ann.rect.x + ann.rect.width);
      const y2 = end ? end.y : (typeof ann.data.y2 === 'number' ? ann.data.y2 : ann.rect.y + ann.rect.height);
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length > 1) {
        segments.push({
          id: ann.id,
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          length,
        });
      }
    }
  }

  if (segments.length >= 3) {
    const graph = buildPlanarGraph(segments, 1.5);
    const graphLoops = extractClosedLoops(graph);
    loops.push(...graphLoops);
  }

  return loops;
}
