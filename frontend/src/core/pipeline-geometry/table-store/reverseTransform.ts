/**
 * Reverse Transformation Engine: Table -> 2D Annotation Geometry.
 *
 * Converts modified table coordinates (in real-world mm) and component properties
 * back into exact PDF point coordinates and annotation patches.
 *
 * Invariant INV-4: Pure TypeScript domain calculations without UI coupling.
 */

import type { PdfAnnotation, Rect, ScaleCalibration } from '../../annotations/types';
import type {
  PipelineCoordinateRow,
  PipelineRestraintRow,
} from '../types';

/**
 * Converts real-world millimeters back to PDF points (1/72 inch).
 */
export function realMmToPdfPoints(mm: number, scaleRatio: number): number {
  if (scaleRatio <= 0) return 0;
  return (mm / (25.4 * scaleRatio)) * 72;
}

/**
 * Calculates annotation patches for modified coordinate rows.
 */
export function computeCoordinatePatches(
  annotations: PdfAnnotation[],
  coordinateRows: PipelineCoordinateRow[],
  dirtyCells: Record<string, boolean>,
  getCalibration: (page: number) => ScaleCalibration,
): Array<{ id: string; patch: Partial<PdfAnnotation> }> {
  const patches: Array<{ id: string; patch: Partial<PdfAnnotation> }> = [];

  // Group dirty coordinate rows by annotationId
  const dirtyByAnnId = new Map<string, PipelineCoordinateRow[]>();

  for (const row of coordinateRows) {
    if (!row.annotationId) continue;
    const isNodeDirty =
      dirtyCells[`coordinates:${row.nodeNumber}:x`] ||
      dirtyCells[`coordinates:${row.nodeNumber}:y`] ||
      dirtyCells[`coordinates:${row.nodeNumber}:z`];

    if (isNodeDirty) {
      const list = dirtyByAnnId.get(row.annotationId) ?? [];
      list.push(row);
      dirtyByAnnId.set(row.annotationId, list);
    }
  }

  for (const [annId, rows] of dirtyByAnnId.entries()) {
    const ann = annotations.find((a) => a.id === annId);
    if (!ann) continue;

    const cal = getCalibration(ann.pageNumber);
    const scaleRatio = cal.scaleRatio > 0 ? cal.scaleRatio : 100;
    const rawPoints = (ann.data?.points as number[]) ?? [];

    if (ann.type === 'line' || ann.type === 'arrow') {
      const baseRect = ann.rect ?? { x: 0, y: 0, width: 0, height: 0 };
      const absVertices: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < rawPoints.length - 1; i += 2) {
        absVertices.push({
          x: baseRect.x + rawPoints[i],
          y: baseRect.y + rawPoints[i + 1],
        });
      }

      // Update vertices that changed
      let geometryModified = false;
      const nodeElevationsPatch: Record<number, number> = {
        ...((ann.data?.nodeElevations as Record<number, number>) ?? {}),
      };

      for (const row of rows) {
        const segIdx = row.segmentIndex ?? 0;
        if (segIdx >= 0 && segIdx < absVertices.length) {
          const newPtX = realMmToPdfPoints(row.x, scaleRatio);
          const newPtY = realMmToPdfPoints(row.y, scaleRatio);

          if (Math.abs(absVertices[segIdx].x - newPtX) > 0.01 || Math.abs(absVertices[segIdx].y - newPtY) > 0.01) {
            absVertices[segIdx] = { x: newPtX, y: newPtY };
            geometryModified = true;
          }
        }
        nodeElevationsPatch[row.nodeNumber] = row.z;
      }

      if (geometryModified && absVertices.length >= 2) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const v of absVertices) {
          minX = Math.min(minX, v.x);
          minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x);
          maxY = Math.max(maxY, v.y);
        }

        const newRect: Rect = {
          x: minX,
          y: minY,
          width: Math.max(maxX - minX, 8),
          height: Math.max(maxY - minY, 8),
        };

        const newRelPoints: number[] = [];
        for (const v of absVertices) {
          newRelPoints.push(Math.round((v.x - newRect.x) * 100) / 100);
          newRelPoints.push(Math.round((v.y - newRect.y) * 100) / 100);
        }

        patches.push({
          id: ann.id,
          patch: {
            rect: newRect,
            data: {
              ...ann.data,
              points: newRelPoints,
              nodeElevations: nodeElevationsPatch,
            },
          },
        });
      } else {
        // Only elevation Z changed
        patches.push({
          id: ann.id,
          patch: {
            data: {
              ...ann.data,
              nodeElevations: nodeElevationsPatch,
            },
          },
        });
      }
    }
  }

  return patches;
}

/**
 * Calculates annotation patches for modified restraint rows (e.g. tag or restraint type changed).
 */
export function computeRestraintPatches(
  annotations: PdfAnnotation[],
  restraintRows: PipelineRestraintRow[],
  dirtyCells: Record<string, boolean>,
): Array<{ id: string; patch: Partial<PdfAnnotation> }> {
  const patches: Array<{ id: string; patch: Partial<PdfAnnotation> }> = [];

  for (const row of restraintRows) {
    const isDirty =
      dirtyCells[`restraints:${row.nodeNumber}:nodeName`] ||
      dirtyCells[`restraints:${row.nodeNumber}:restraintType`];

    if (!isDirty) continue;

    const ann = annotations.find(
      (a) => a.id === `support-${row.nodeNumber}` || (a.data?.text && String(a.data.text).includes(row.nodeName)),
    );

    if (ann) {
      patches.push({
        id: ann.id,
        patch: {
          data: {
            ...ann.data,
            supportTag: row.nodeName,
            supportType: row.restraintType,
            text: row.nodeName,
          },
        },
      });
    }
  }

  return patches;
}

/**
 * Parses TSV clipboard string into typed coordinate rows.
 * Supports both 4-column (Node, X, Y, Z) and 5-column (Branch, Node, X, Y, Z) TSVs.
 */
export function parseCoordinateTsv(tsvText: string): Partial<PipelineCoordinateRow>[] {
  const lines = tsvText.trim().split(/\r?\n/);
  const rows: Partial<PipelineCoordinateRow>[] = [];

  for (const line of lines) {
    const parts = line.split('\t').map((p) => p.trim());
    if (parts.length < 4) continue;

    let branchName: string | undefined;
    let nodeNumber: number;
    let x: number;
    let y: number;
    let z: number;

    if (Number.isFinite(Number(parts[0]))) {
      // 4-column format: Node, X, Y, Z
      nodeNumber = Number(parts[0]);
      x = Number(parts[1]);
      y = Number(parts[2]);
      z = Number(parts[3]);
    } else if (parts.length >= 5 && Number.isFinite(Number(parts[1]))) {
      // 5-column format: Branch, Node, X, Y, Z
      branchName = parts[0];
      nodeNumber = Number(parts[1]);
      x = Number(parts[2]);
      y = Number(parts[3]);
      z = Number(parts[4]);
    } else {
      // Header row or non-numeric line
      continue;
    }

    if (Number.isFinite(nodeNumber) && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      rows.push({
        ...(branchName ? { branchName } : {}),
        nodeNumber,
        x,
        y,
        z,
      });
    }
  }

  return rows;
}
