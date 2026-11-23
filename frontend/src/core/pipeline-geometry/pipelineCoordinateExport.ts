/**
 * Pipeline Coordinate Exporter for XML Builder (CAESAR II / XML CII).
 *
 * Transforms 2D PDF drawing lines, calipers, and multi-segment pipe runs into
 * the exact TSV format required by XML_Compare_Utilities > Utilities > XML Builder > Coordinates:
 *
 *   BranchName\tNodeNumber\tX\tY\tZ
 *
 * Pure TypeScript domain implementation (INV-4 compliant).
 */

import type { PdfAnnotation } from '../annotations/types';
import {
  DEFAULT_SCALE_CALIBRATION,
  type ScaleCalibration,
} from '../annotations/calibration';
import {
  DEFAULT_PIPELINE_EXPORT_OPTIONS,
  type PipelineCoordinateExportOptions,
  type PipelineCoordinateRow,
} from './types';

/**
 * Converts PDF points (1/72 inch) to real-world millimeters based on drawing scale ratio.
 */
export function pdfPointsToRealMm(pt: number, scaleRatio: number): number {
  return (pt / 72) * 25.4 * scaleRatio;
}

/**
 * Extracts coordinate rows from drawing annotations (lines, arrows, pipe runs).
 */
export function extractPipelineCoordinates(
  annotations: PdfAnnotation[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
  options?: PipelineCoordinateExportOptions,
): PipelineCoordinateRow[] {
  const opts = {
    ...DEFAULT_PIPELINE_EXPORT_OPTIONS,
    ...options,
  };

  const rows: PipelineCoordinateRow[] = [];
  let currentNode = opts.startNodeNumber;

  for (const ann of annotations) {
    const cal = getCalibration(ann.pageNumber);
    const scaleRatio = cal.scaleRatio > 0 ? cal.scaleRatio : 100;
    const branch = (ann.data?.branchName as string) || (ann.data?.text as string) || opts.branchName;
    const customElevation = typeof ann.data?.elevationZ === 'number' ? ann.data.elevationZ : opts.defaultElevationZ;
    const customNodeElevations = (ann.data?.nodeElevations as Record<number, number> | undefined);

    // 1. Multi-vertex line / pipe run (points array [x1, y1, x2, y2, x3, y3...])
    const rawPoints = (ann.data?.points as number[]) ?? [];
    if (Array.isArray(rawPoints) && rawPoints.length >= 4) {
      const vertices: Array<{ x: number; y: number }> = [];
      const baseRect = ann.rect ?? { x: 0, y: 0, width: 0, height: 0 };

      for (let i = 0; i < rawPoints.length - 1; i += 2) {
        if (Number.isFinite(rawPoints[i]) && Number.isFinite(rawPoints[i + 1])) {
          // Absolute coordinate = rect offset + relative point
          const absX = baseRect.x + rawPoints[i];
          const absY = baseRect.y + rawPoints[i + 1];
          vertices.push({ x: absX, y: absY });
        }
      }

      if (opts.routingMode === 'isometric') {
        // Isometric 3D routing: decomposes 2D isometric drawing vectors into true 3D (X East, Y North, Z Elevation)
        let curX = pdfPointsToRealMm(vertices[0].x, scaleRatio) - opts.origin.x;
        let curY = pdfPointsToRealMm(vertices[0].y, scaleRatio);
        if (opts.invertYAxis) curY = -curY;
        curY -= opts.origin.y;
        let curZ = customElevation;

        const intermediateCoords: Array<{ x: number; y: number; z: number }> = [];

        for (let i = 0; i < vertices.length; i++) {
          if (i === 0) {
            const zOverride = opts.nodeElevations?.[currentNode] ?? customNodeElevations?.[i] ?? curZ;
            curZ = zOverride;
            intermediateCoords.push({ x: curX, y: curY, z: curZ });
          } else {
            const prevV = vertices[i - 1];
            const v = vertices[i];
            const dx = v.x - prevV.x;
            const dy = v.y - prevV.y;
            const distPt = Math.hypot(dx, dy);
            const distMm = pdfPointsToRealMm(distPt, scaleRatio);
            const angle = Math.atan2(dy, dx); // dy > 0 is down in PDF

            // Check if vertical (near -90° up or +90° down)
            const isVertical = Math.abs(Math.abs(angle) - Math.PI / 2) < Math.PI / 7; // within ~25°

            if (isVertical) {
              // Upward on sheet (dy < 0) = Riser UP (+Z), downward (dy > 0) = Drop DOWN (-Z)
              const dz = dy < 0 ? distMm : -distMm;
              curZ += dz;
            } else {
              // Horizontal plane in isometric: check if East/West (~30° or ~210°) vs North/South (~150° or ~-30°)
              // 30° is dx > 0, dy > 0 (down-right); -150° is dx < 0, dy < 0 (up-left)
              const isEastWest = (dx > 0 && dy >= 0) || (dx < 0 && dy <= 0);
              if (isEastWest) {
                curX += dx > 0 ? distMm : -distMm;
              } else {
                curY += dy < 0 ? distMm : -distMm;
              }
            }

            const zOverride = opts.nodeElevations?.[currentNode + i * opts.nodeIncrement] ?? customNodeElevations?.[i] ?? curZ;
            curZ = zOverride;
            intermediateCoords.push({ x: curX, y: curY, z: curZ });
          }
        }

        // Build coordinate rows with accurate 3D spatial cut length
        for (let i = 0; i < intermediateCoords.length; i++) {
          const coord = intermediateCoords[i];
          let lengthToNextMm: number | undefined;
          if (i < intermediateCoords.length - 1) {
            const nextCoord = intermediateCoords[i + 1];
            lengthToNextMm = Math.round(
              Math.hypot(nextCoord.x - coord.x, nextCoord.y - coord.y, nextCoord.z - coord.z),
            );
          }

          rows.push({
            branchName: branch,
            nodeNumber: currentNode,
            x: Math.round(coord.x),
            y: Math.round(coord.y),
            z: Math.round(coord.z),
            pageNumber: ann.pageNumber,
            annotationId: ann.id,
            segmentIndex: i,
            lengthToNextMm,
          });

          currentNode += opts.nodeIncrement;
        }
      } else {
        // Plan 2D routing (default): maps to horizontal (X, Y) plane with explicit node/line elevations
        const intermediateCoords: Array<{ x: number; y: number; z: number }> = [];

        for (let i = 0; i < vertices.length; i++) {
          const v = vertices[i];
          const realX = pdfPointsToRealMm(v.x, scaleRatio) - opts.origin.x;
          let realY = pdfPointsToRealMm(v.y, scaleRatio);
          if (opts.invertYAxis) {
            realY = -realY;
          }
          realY -= opts.origin.y;

          const nodeZ = opts.nodeElevations?.[currentNode + i * opts.nodeIncrement] ?? customNodeElevations?.[i] ?? customElevation;
          intermediateCoords.push({ x: realX, y: realY, z: nodeZ });
        }

        for (let i = 0; i < intermediateCoords.length; i++) {
          const coord = intermediateCoords[i];
          let lengthToNextMm: number | undefined;
          if (i < intermediateCoords.length - 1) {
            const nextCoord = intermediateCoords[i + 1];
            lengthToNextMm = Math.round(
              Math.hypot(nextCoord.x - coord.x, nextCoord.y - coord.y, nextCoord.z - coord.z),
            );
          }

          rows.push({
            branchName: branch,
            nodeNumber: currentNode,
            x: Math.round(coord.x),
            y: Math.round(coord.y),
            z: Math.round(coord.z),
            pageNumber: ann.pageNumber,
            annotationId: ann.id,
            segmentIndex: i,
            lengthToNextMm,
          });

          currentNode += opts.nodeIncrement;
        }
      }
    } else if (ann.type === 'line' || ann.type === 'arrow') {
      // 2. Simple bounding box line (from (rect.x, rect.y) to (rect.x + width, rect.y + height))
      const rect = ann.rect;
      const x1 = pdfPointsToRealMm(rect.x, scaleRatio) - opts.origin.x;
      let y1 = pdfPointsToRealMm(rect.y, scaleRatio);
      const x2 = pdfPointsToRealMm(rect.x + rect.width, scaleRatio) - opts.origin.x;
      let y2 = pdfPointsToRealMm(rect.y + rect.height, scaleRatio);

      if (opts.invertYAxis) {
        y1 = -y1;
        y2 = -y2;
      }
      y1 -= opts.origin.y;
      y2 -= opts.origin.y;

      const z1 = opts.nodeElevations?.[currentNode] ?? customElevation;
      const z2 = opts.nodeElevations?.[currentNode + opts.nodeIncrement] ?? customElevation;

      const lengthMm = Math.round(Math.hypot(x2 - x1, y2 - y1, z2 - z1));

      // Start Node
      rows.push({
        branchName: branch,
        nodeNumber: currentNode,
        x: Math.round(x1),
        y: Math.round(y1),
        z: Math.round(z1),
        pageNumber: ann.pageNumber,
        annotationId: ann.id,
        segmentIndex: 0,
        lengthToNextMm: lengthMm,
      });
      currentNode += opts.nodeIncrement;

      // End Node
      rows.push({
        branchName: branch,
        nodeNumber: currentNode,
        x: Math.round(x2),
        y: Math.round(y2),
        z: Math.round(z2),
        pageNumber: ann.pageNumber,
        annotationId: ann.id,
        segmentIndex: 1,
      });
      currentNode += opts.nodeIncrement;
    }
  }

  return rows;
}

/**
 * Generates TSV text matching XML Builder > Coordinates format:
 *   BranchName\tNodeNumber\tX\tY\tZ
 *
 * Directly pasteable into https://reallakshman19.github.io/XML_Compare_Utilities/ > Utilities > XML Builder.
 */
export function generateXmlBuilderCoordinateTsv(rows: PipelineCoordinateRow[]): string {
  const header = 'BranchName\tNodeNumber\tX\tY\tZ';
  const lines = [header];

  for (const r of rows) {
    lines.push(`${r.branchName}\t${r.nodeNumber}\t${r.x}\t${r.y}\t${r.z}`);
  }

  return lines.join('\n');
}

/**
 * Generates detailed CSV with segment lengths and page metadata.
 */
export function generatePipelineCoordinateCsv(rows: PipelineCoordinateRow[]): string {
  const headers = ['BranchName', 'NodeNumber', 'X_mm', 'Y_mm', 'Z_mm', 'LengthToNext_mm', 'Page', 'AnnotationId'];
  const lines = [headers.join(',')];

  for (const r of rows) {
    const lenStr = typeof r.lengthToNextMm === 'number' ? r.lengthToNextMm : '-';
    lines.push([
      `"${r.branchName}"`,
      r.nodeNumber,
      r.x,
      r.y,
      r.z,
      lenStr,
      r.pageNumber,
      `"${r.annotationId}"`,
    ].join(','));
  }

  return lines.join('\r\n');
}
