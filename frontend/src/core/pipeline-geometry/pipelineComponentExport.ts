/**
 * Pipeline Component & Displacement Exporter for XML Builder (CAESAR II / XML CII).
 *
 * Extracts heavy inline components (Valves, Flanges, Pumps) for weightRows and
 * nozzle thermal expansion / imposed displacements for dtxrRows:
 *
 *   weightRows: branchName\tnodeNumber\tcomponentType\trigid\tendpoint\tweight\tcomponentRefNo
 *   dtxrRows:   branchName\tnodeNumber\tdtxr
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { PdfAnnotation } from '../annotations/types';
import {
  DEFAULT_SCALE_CALIBRATION,
  type ScaleCalibration,
} from '../annotations/calibration';
import { findNearestCoordinateNode } from './pipelineRestraintExport';
import {
  STANDARD_ASME_PIPE_SPECS,
  type ComponentType,
  type PipelineCoordinateRow,
  type PipelineDtxrRow,
  type PipelineWeightRow,
} from './types';

/**
 * Checks if an annotation represents an inline piping component (valve, flange, pump).
 */
export function isComponentAnnotation(ann: PdfAnnotation): boolean {
  if (ann.type === 'piping-valve') return true;

  const data = ann.data;
  if (data?.componentType) return true;

  const text = ((data?.text as string) || (data?.label as string) || '').toUpperCase();
  const componentKeywords = ['VALVE', 'GATE', 'GLOBE', 'CHECK', 'BALL', 'BUTTERFLY', 'CONTROL', 'FLANGE', 'PUMP', 'METER', 'BLIND'];

  return componentKeywords.some((kw) => text.includes(kw));
}

/**
 * Infers component type from annotation.
 */
export function inferComponentType(ann: PdfAnnotation): ComponentType {
  const custom = ann.data?.componentType as ComponentType | undefined;
  if (custom) return custom;

  const text = ((ann.data?.text as string) || (ann.data?.label as string) || '').toUpperCase();
  if (text.includes('FLANGE')) return 'FLANGE';
  if (text.includes('PUMP')) return 'PUMP';
  if (text.includes('METER')) return 'METER';
  if (text.includes('BLIND')) return 'BLIND';
  if (text.includes('REDUCER')) return 'REDUCER';

  return 'VALVE';
}

/**
 * Extracts weightRows by finding valve/component annotations and associating them with nearest pipe nodes.
 */
export function extractPipelineWeights(
  annotations: PdfAnnotation[],
  coordinates: PipelineCoordinateRow[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
): PipelineWeightRow[] {
  const rows: PipelineWeightRow[] = [];
  const compAnnotations = annotations.filter(isComponentAnnotation);

  let compCount = 1;

  for (const ann of compAnnotations) {
    const cal = getCalibration(ann.pageNumber);
    const scaleRatio = cal.scaleRatio > 0 ? cal.scaleRatio : 100;

    let sheetX = ann.rect?.x ?? 0;
    let sheetY = ann.rect?.y ?? 0;
    if (ann.data?.anchor && typeof ann.data.anchor.x === 'number' && typeof ann.data.anchor.y === 'number') {
      sheetX = ann.data.anchor.x;
      sheetY = ann.data.anchor.y;
    } else if (ann.rect) {
      sheetX = ann.rect.x + (ann.rect.width ?? 0) / 2;
      sheetY = ann.rect.y + (ann.rect.height ?? 0) / 2;
    }

    const nearestNode = findNearestCoordinateNode(sheetX, sheetY, ann.pageNumber, coordinates, scaleRatio);
    if (!nearestNode) continue;

    const componentType = inferComponentType(ann);
    const componentRefNo =
      (ann.data?.componentRefNo as string) ||
      (ann.data?.label as string) ||
      (ann.data?.text as string) ||
      `V-${compCount * 10}`;

    // Lookup standard default valve weight if not explicitly provided
    let weight = typeof ann.data?.weight === 'number' ? ann.data.weight : undefined;
    if (weight === undefined) {
      // Find matching standard spec
      weight = STANDARD_ASME_PIPE_SPECS['4"'].defaultValveWeightKg;
    }

    const rigid = typeof ann.data?.rigid === 'boolean' ? ann.data.rigid : true;
    const endpoint = typeof ann.data?.endpoint === 'number' ? ann.data.endpoint : nearestNode.nodeNumber + 5;

    rows.push({
      branchName: nearestNode.branchName,
      nodeNumber: nearestNode.nodeNumber,
      componentType,
      rigid,
      endpoint,
      weight,
      componentRefNo,
    });

    compCount++;
  }

  return rows;
}

/**
 * Extracts dtxrRows (nozzle thermal expansions / imposed displacements).
 */
export function extractPipelineDtxr(
  annotations: PdfAnnotation[],
  coordinates: PipelineCoordinateRow[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
): PipelineDtxrRow[] {
  const rows: PipelineDtxrRow[] = [];

  for (const ann of annotations) {
    const data = ann.data;
    if (!data?.dtxr && !(typeof data?.text === 'string' && data.text.toUpperCase().includes('DX='))) {
      continue;
    }

    const dtxr = (data.dtxr as string) || (data.text as string);
    const cal = getCalibration(ann.pageNumber);
    const scaleRatio = cal.scaleRatio > 0 ? cal.scaleRatio : 100;

    const sheetX = ann.rect?.x ?? 0;
    const sheetY = ann.rect?.y ?? 0;
    const nearestNode = findNearestCoordinateNode(sheetX, sheetY, ann.pageNumber, coordinates, scaleRatio);
    if (!nearestNode) continue;

    rows.push({
      branchName: nearestNode.branchName,
      nodeNumber: nearestNode.nodeNumber,
      dtxr: dtxr.trim(),
    });
  }

  return rows;
}

/**
 * Generates TSV text matching XML Builder > Weights:
 *   branchName\tnodeNumber\tcomponentType\trigid\tendpoint\tweight\tcomponentRefNo
 */
export function generateXmlBuilderWeightTsv(rows: PipelineWeightRow[]): string {
  const header = 'branchName\tnodeNumber\tcomponentType\trigid\tendpoint\tweight\tcomponentRefNo';
  const lines = [header];

  for (const r of rows) {
    lines.push(
      `${r.branchName}\t${r.nodeNumber}\t${r.componentType}\t${r.rigid ? 'TRUE' : 'FALSE'}\t${r.endpoint}\t${r.weight}\t${r.componentRefNo}`,
    );
  }

  return lines.join('\n');
}

/**
 * Generates TSV text matching XML Builder > DTXR:
 *   branchName\tnodeNumber\tdtxr
 */
export function generateXmlBuilderDtxrTsv(rows: PipelineDtxrRow[]): string {
  const header = 'branchName\tnodeNumber\tdtxr';
  const lines = [header];

  for (const r of rows) {
    lines.push(`${r.branchName}\t${r.nodeNumber}\t${r.dtxr}`);
  }

  return lines.join('\n');
}
