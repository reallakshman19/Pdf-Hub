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
  const opts: Required<PipelineCoordinateExportOptions> = {
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

      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const realX = pdfPointsToRealMm(v.x, scaleRatio) - opts.origin.x;
        let realY = pdfPointsToRealMm(v.y, scaleRatio);
        if (opts.invertYAxis) {
          realY = -realY;
        }
        realY -= opts.origin.y;

        let lengthToNextMm: number | undefined;
        if (i < vertices.length - 1) {
          const nextV = vertices[i + 1];
          const dx = pdfPointsToRealMm(nextV.x - v.x, scaleRatio);
          const dy = pdfPointsToRealMm(nextV.y - v.y, scaleRatio);
          lengthToNextMm = Math.round(Math.hypot(dx, dy));
        }

        rows.push({
          branchName: branch,
          nodeNumber: currentNode,
          x: Math.round(realX),
          y: Math.round(realY),
          z: Math.round(customElevation),
          pageNumber: ann.pageNumber,
          annotationId: ann.id,
          segmentIndex: i,
          lengthToNextMm,
        });

        currentNode += opts.nodeIncrement;
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

      const lengthMm = Math.round(Math.hypot(x2 - x1, y2 - y1));

      // Start Node
      rows.push({
        branchName: branch,
        nodeNumber: currentNode,
        x: Math.round(x1),
        y: Math.round(y1),
        z: Math.round(customElevation),
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
        z: Math.round(customElevation),
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
