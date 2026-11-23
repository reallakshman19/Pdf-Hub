/**
 * Pipeline Branch Exporter for XML Builder (CAESAR II / XML CII).
 *
 * Extracts pipe cross-section properties, design pressure, temperature, and fluid density
 * conforming to XML_Compare_Utilities > Utilities > XML Builder > Branches:
 *
 *   branchName\tnodeNumber\tboreMm\twallThickness\tp1\tt1\tt2\tt3\tfluidDensity
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { PdfAnnotation } from '../annotations/types';
import {
  STANDARD_ASME_PIPE_SPECS,
  type PipelineBranchRow,
  type PipelineCoordinateRow,
} from './types';

export interface BranchExtractionOptions {
  defaultBoreMm?: number;
  defaultWallThickness?: number;
  defaultP1?: number; // bar
  defaultT1?: number; // °C
  defaultT2?: number; // °C
  defaultT3?: number; // °C (ambient)
  defaultFluidDensity?: number; // kg/m³
}

export const DEFAULT_BRANCH_OPTIONS: Required<BranchExtractionOptions> = {
  defaultBoreMm: 100, // 4" standard
  defaultWallThickness: 6.02, // 4" STD wall
  defaultP1: 16, // 16 barg
  defaultT1: 150, // 150 °C
  defaultT2: 21,
  defaultT3: 21,
  defaultFluidDensity: 1000, // Water
};

/**
 * Attempts to parse nominal pipe size from text strings like '4"', '6"-P-101', 'DN150', '8 INCH'.
 */
export function parsePipeSizeFromText(text?: string): { boreMm: number; wallThickness: number } | null {
  if (!text) return null;
  const upper = text.toUpperCase();

  // 1. Generic DNxxx pattern with word boundaries (e.g. DN200, DN 150)
  const dnMatch = upper.match(/\bDN\s*(\d+)\b/);
  if (dnMatch) {
    const dn = parseInt(dnMatch[1], 10);
    if (Number.isFinite(dn) && dn > 0) {
      const closest = Object.values(STANDARD_ASME_PIPE_SPECS).reduce((prev, curr) =>
        Math.abs(curr.dnMm - dn) < Math.abs(prev.dnMm - dn) ? curr : prev,
      );
      return { boreMm: dn, wallThickness: closest.wallThicknessStdMm };
    }
  }

  // 2. NPS patterns (e.g. 4", 6"-P-101, 8 INCH) - sort descending by raw size length to avoid substring collisions
  const sortedSpecs = Object.entries(STANDARD_ASME_PIPE_SPECS).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [nps, spec] of sortedSpecs) {
    const rawSize = nps.replace('"', '');
    const escaped = rawSize.replace('.', '\\.');
    const regex = new RegExp(`(?:^|[^0-9.])${escaped}(?:["”]|\\s*-?\\s*(?:INCH|IN))`, 'i');
    if (regex.test(upper) || upper.includes(`"${rawSize}"`) || upper.includes(`${rawSize}"`)) {
      return { boreMm: spec.dnMm, wallThickness: spec.wallThicknessStdMm };
    }
  }

  return null;
}

/**
 * Extracts branchRows for each unique branch or starting node in coordinate rows.
 */
export function extractPipelineBranches(
  coordinateRows: PipelineCoordinateRow[],
  annotations: PdfAnnotation[] = [],
  options?: BranchExtractionOptions,
): PipelineBranchRow[] {
  const opts = { ...DEFAULT_BRANCH_OPTIONS, ...options };
  const rows: PipelineBranchRow[] = [];

  // Group coordinate rows by branchName
  const byBranch = new Map<string, PipelineCoordinateRow[]>();
  for (const cr of coordinateRows) {
    const existing = byBranch.get(cr.branchName) ?? [];
    existing.push(cr);
    byBranch.set(cr.branchName, existing);
  }

  const annMap = new Map<string, PdfAnnotation>();
  for (const ann of annotations) {
    annMap.set(ann.id, ann);
  }

  for (const [branchName, coords] of byBranch.entries()) {
    if (coords.length === 0) continue;
    const startNode = coords[0].nodeNumber;

    // Check if the originating annotation has specific properties
    const firstAnn = annMap.get(coords[0].annotationId);
    const annBore = typeof firstAnn?.data?.boreMm === 'number' ? firstAnn.data.boreMm : undefined;
    const annWall = typeof firstAnn?.data?.wallThickness === 'number' ? firstAnn.data.wallThickness : undefined;
    const annP1 = typeof firstAnn?.data?.p1 === 'number' ? firstAnn.data.p1 : undefined;
    const annT1 = typeof firstAnn?.data?.t1 === 'number' ? firstAnn.data.t1 : undefined;
    const annFluid = typeof firstAnn?.data?.fluidDensity === 'number' ? firstAnn.data.fluidDensity : undefined;

    // Infer from branchName text or annotation label
    const parsed = parsePipeSizeFromText(branchName) || parsePipeSizeFromText(firstAnn?.data?.text as string);

    const boreMm = annBore ?? parsed?.boreMm ?? opts.defaultBoreMm;
    const wallThickness = annWall ?? parsed?.wallThickness ?? opts.defaultWallThickness;
    const p1 = annP1 ?? opts.defaultP1;
    const t1 = annT1 ?? opts.defaultT1;
    const t2 = opts.defaultT2;
    const t3 = opts.defaultT3;
    const fluidDensity = annFluid ?? opts.defaultFluidDensity;

    rows.push({
      branchName,
      nodeNumber: startNode,
      boreMm,
      wallThickness,
      p1,
      t1,
      t2,
      t3,
      fluidDensity,
    });
  }

  return rows;
}

/**
 * Generates TSV text matching XML Builder > Branches:
 *   branchName\tnodeNumber\tboreMm\twallThickness\tp1\tt1\tt2\tt3\tfluidDensity
 */
export function generateXmlBuilderBranchTsv(rows: PipelineBranchRow[]): string {
  const header = 'branchName\tnodeNumber\tboreMm\twallThickness\tp1\tt1\tt2\tt3\tfluidDensity';
  const lines = [header];

  for (const r of rows) {
    const t2Str = typeof r.t2 === 'number' ? r.t2 : '';
    const t3Str = typeof r.t3 === 'number' ? r.t3 : '';
    const densityStr = typeof r.fluidDensity === 'number' ? r.fluidDensity : '';
    lines.push(
      `${r.branchName}\t${r.nodeNumber}\t${r.boreMm}\t${r.wallThickness}\t${r.p1}\t${r.t1}\t${t2Str}\t${t3Str}\t${densityStr}`,
    );
  }

  return lines.join('\n');
}
