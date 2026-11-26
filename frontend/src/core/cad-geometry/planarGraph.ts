import type {
  CadClosedLoop,
  CadLineSegment,
  DcelHalfEdge,
  DcelVertex,
  Point2D,
} from './types';

function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function vertexKey(pt: Point2D, tol = 1e-3): string {
  const quantX = Math.round(pt.x / tol) * tol;
  const quantY = Math.round(pt.y / tol) * tol;
  return `${quantX.toFixed(3)}:${quantY.toFixed(3)}`;
}

export interface PlanarGraph {
  vertices: Map<string, DcelVertex>;
  halfEdges: Map<string, DcelHalfEdge>;
}

/**
 * Builds a Doubly Connected Edge List (DCEL) planar graph from line segments.
 * Outgoing half-edges at each vertex are sorted by azimuth angle, wiring .nextId and .prevId
 * to trace closed interior faces counter-clockwise.
 */
export function buildPlanarGraph(
  lines: CadLineSegment[],
  pointTolerance = 1e-3,
): PlanarGraph {
  const vertices = new Map<string, DcelVertex>();
  const halfEdges = new Map<string, DcelHalfEdge>();

  const getOrCreateVertex = (pt: Point2D): DcelVertex => {
    const key = vertexKey(pt, pointTolerance);
    const vId = `v_${key}`;
    let v = vertices.get(vId);
    if (!v) {
      v = {
        id: vId,
        point: { x: pt.x, y: pt.y },
      };
      vertices.set(vId, v);
    }
    return v;
  };

  // 1. Create half-edges for each segment
  const outgoingByVertex = new Map<string, DcelHalfEdge[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (distance(line.start, line.end) < pointTolerance) {
      continue; // Skip zero-length
    }

    const vA = getOrCreateVertex(line.start);
    const vB = getOrCreateVertex(line.end);
    if (vA.id === vB.id) continue;

    const fwdId = `he_${i}_fwd`;
    const revId = `he_${i}_rev`;

    const angleFwd = Math.atan2(vB.point.y - vA.point.y, vB.point.x - vA.point.x);
    const angleRev = Math.atan2(vA.point.y - vB.point.y, vA.point.x - vB.point.x);

    const heFwd: DcelHalfEdge = {
      id: fwdId,
      originId: vA.id,
      targetId: vB.id,
      twinId: revId,
      nextId: '',
      prevId: '',
      angle: angleFwd,
      sourceSegmentId: line.id,
    };

    const heRev: DcelHalfEdge = {
      id: revId,
      originId: vB.id,
      targetId: vA.id,
      twinId: fwdId,
      nextId: '',
      prevId: '',
      angle: angleRev,
      sourceSegmentId: line.id,
    };

    halfEdges.set(fwdId, heFwd);
    halfEdges.set(revId, heRev);

    vA.incidentEdgeId = fwdId;
    vB.incidentEdgeId = revId;

    if (!outgoingByVertex.has(vA.id)) outgoingByVertex.set(vA.id, []);
    outgoingByVertex.get(vA.id)!.push(heFwd);

    if (!outgoingByVertex.has(vB.id)) outgoingByVertex.set(vB.id, []);
    outgoingByVertex.get(vB.id)!.push(heRev);
  }

  // 2. Sort outgoing half-edges radially at each vertex and wire next/prev pointers
  for (const outgoing of outgoingByVertex.values()) {
    if (outgoing.length === 0) continue;

    // Sort counter-clockwise by azimuth angle in [-pi, pi]
    outgoing.sort((a, b) => a.angle - b.angle);

    const k = outgoing.length;
    for (let m = 0; m < k; m++) {
      const outEdge = outgoing[m];
      const incomingTwin = halfEdges.get(outEdge.twinId);
      if (!incomingTwin) continue;

      // When arriving at vertex along incomingTwin, turning left continues to the previous
      // edge in the counter-clockwise sorted outgoing list: (m - 1 + k) % k
      const nextOutEdge = outgoing[(m - 1 + k) % k];
      incomingTwin.nextId = nextOutEdge.id;
      nextOutEdge.prevId = incomingTwin.id;
    }
  }

  return { vertices, halfEdges };
}

/**
 * Computes signed polygon area using the Shoelace formula.
 * Returns > 0 for Counter-Clockwise (CCW) polygons, < 0 for Clockwise (CW).
 */
export function computeSignedPolygonArea(pts: Point2D[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area2 / 2;
}

/**
 * Traverses a DCEL planar graph to extract all bounded closed polygonal loops (faces).
 * Unbounded exterior faces (negative area) are separated or filtered.
 */
export function extractClosedLoops(graph: PlanarGraph): CadClosedLoop[] {
  const visitedHalfEdges = new Set<string>();
  const loops: CadClosedLoop[] = [];

  for (const [heId, startHe] of graph.halfEdges.entries()) {
    if (visitedHalfEdges.has(heId)) continue;

    const cycleHalfEdges: DcelHalfEdge[] = [];
    const cycleVertices: Point2D[] = [];
    let curr: DcelHalfEdge | undefined = startHe;
    let safeCount = 0;
    const maxSteps = graph.halfEdges.size + 1;

    while (curr && !visitedHalfEdges.has(curr.id) && safeCount < maxSteps) {
      visitedHalfEdges.add(curr.id);
      cycleHalfEdges.push(curr);

      const originVertex = graph.vertices.get(curr.originId);
      if (originVertex) {
        cycleVertices.push(originVertex.point);
      }

      if (!curr.nextId || curr.nextId === startHe.id) {
        break;
      }

      curr = graph.halfEdges.get(curr.nextId);
      safeCount++;
    }

    if (cycleVertices.length >= 3 && curr && curr.nextId === startHe.id) {
      const signedArea = computeSignedPolygonArea(cycleVertices);

      // Only interior bounded faces have positive signed area (counter-clockwise)
      if (signedArea > 1e-4) {
        let perimeter = 0;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const n = cycleVertices.length;
        let cxSum = 0;
        let cySum = 0;

        for (let i = 0; i < n; i++) {
          const pt = cycleVertices[i];
          const nextPt = cycleVertices[(i + 1) % n];

          perimeter += distance(pt, nextPt);

          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;

          const factor = pt.x * nextPt.y - nextPt.x * pt.y;
          cxSum += (pt.x + nextPt.x) * factor;
          cySum += (pt.y + nextPt.y) * factor;
        }

        const area = Math.abs(signedArea);
        const centroid: Point2D = {
          x: cxSum / (6 * signedArea),
          y: cySum / (6 * signedArea),
        };

        loops.push({
          id: `cad-loop-${loops.length + 1}`,
          vertices: cycleVertices,
          area,
          perimeter,
          centroid,
          isClockwise: false,
          bounds: { minX, minY, maxX, maxY },
          edgeIds: cycleHalfEdges.map((e) => e.sourceSegmentId ?? e.id),
        });
      }
    }
  }

  return loops;
}
