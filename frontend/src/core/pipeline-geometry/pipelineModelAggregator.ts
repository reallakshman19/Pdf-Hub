/**
 * Pipeline Model Aggregator & XML Builder Bridge Package.
 *
 * Integrates all 5 tables (Coordinates, Branches, Restraints, Weights, Displacements)
 * into a single unified piping stress model, ready for CAESAR II XML generation or
 * 1-click cross-app launching into https://reallakshman19.github.io/XML_Compare_Utilities/.
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { PdfAnnotation } from '../annotations/types';
import {
  DEFAULT_SCALE_CALIBRATION,
  type ScaleCalibration,
} from '../annotations/calibration';
import {
  extractPipelineCoordinates,
  generateXmlBuilderCoordinateTsv,
} from './pipelineCoordinateExport';
import {
  extractPipelineBranches,
  generateXmlBuilderBranchTsv,
} from './pipelineBranchExport';
import {
  extractPipelineRestraints,
  generateXmlBuilderRestraintTsv,
} from './pipelineRestraintExport';
import {
  extractPipelineWeights,
  extractPipelineDtxr,
  generateXmlBuilderWeightTsv,
  generateXmlBuilderDtxrTsv,
} from './pipelineComponentExport';
import type {
  FullXmlBuilderModel,
  PipelineCoordinateExportOptions,
} from './types';

export const XML_COMPARE_UTILITIES_BASE_URL =
  'https://reallakshman19.github.io/XML_Compare_Utilities/';

/**
 * Extracts all 5 XML Builder tables from the current document annotations.
 */
export function extractFullXmlBuilderModel(
  annotations: PdfAnnotation[],
  getCalibration: (page: number) => ScaleCalibration = () => DEFAULT_SCALE_CALIBRATION,
  options?: PipelineCoordinateExportOptions,
): FullXmlBuilderModel {
  const coordinateRows = extractPipelineCoordinates(annotations, getCalibration, options);
  const branchRows = extractPipelineBranches(coordinateRows, annotations);
  const restraintRows = extractPipelineRestraints(annotations, coordinateRows, getCalibration);
  const weightRows = extractPipelineWeights(annotations, coordinateRows, getCalibration);
  const dtxrRows = extractPipelineDtxr(annotations, coordinateRows, getCalibration);

  return {
    coordinateRows,
    branchRows,
    restraintRows,
    weightRows,
    dtxrRows,
  };
}

/**
 * Serializes all 5 tables into their exact XML Builder TSV format.
 */
export function serializeXmlBuilderTablesToTsv(model: FullXmlBuilderModel): {
  coordinateRows: string;
  branchRows: string;
  restraintRows: string;
  weightRows: string;
  dtxrRows: string;
} {
  return {
    coordinateRows: generateXmlBuilderCoordinateTsv(model.coordinateRows),
    branchRows: generateXmlBuilderBranchTsv(model.branchRows),
    restraintRows: generateXmlBuilderRestraintTsv(model.restraintRows),
    weightRows: generateXmlBuilderWeightTsv(model.weightRows),
    dtxrRows: generateXmlBuilderDtxrTsv(model.dtxrRows),
  };
}

/**
 * Generates the deep link launch URL for XML Compare Utilities > Utilities > XML Builder.
 * Encodes the 5 tables into the URL hash fragment or bridge query parameter.
 */
export function createXmlBuilderLaunchUrl(
  model: FullXmlBuilderModel,
  baseUrl: string = XML_COMPARE_UTILITIES_BASE_URL,
): string {
  const tables = serializeXmlBuilderTablesToTsv(model);
  const payload = JSON.stringify({
    source: 'PDF-Hub',
    version: '1.0',
    timestamp: Date.now(),
    tables,
  });

  const encoded = encodeURIComponent(payload);
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/?tab=utilities&tool=xml-builder#customInput=${encoded}`;
}
