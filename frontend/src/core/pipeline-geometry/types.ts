/**
 * Pipeline Geometry & XML Builder Coordinate Interoperability Types.
 *
 * Conforms to ISO 32000-1 coordinate systems and CAESAR II / XML CII
 * piping stress coordinate contracts (XML_Compare_Utilities > XML Builder > Coordinates).
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

export interface PipelineCoordinateRow {
  branchName: string;
  nodeNumber: number;
  x: number; // in mm (East coordinate)
  y: number; // in mm (North coordinate)
  z: number; // in mm (Elevation)
  pageNumber: number;
  annotationId: string;
  segmentIndex?: number;
  lengthToNextMm?: number;
  pdfPoint?: { x: number; y: number };
}

export type PipelineRoutingMode = 'plan' | 'isometric';

export interface PipelineCoordinateExportOptions {
  branchName?: string;
  startNodeNumber?: number;
  nodeIncrement?: number;
  defaultElevationZ?: number;
  origin?: { x: number; y: number }; // custom datum offset in mm
  invertYAxis?: boolean; // match CAD North/South upward axis vs PDF top-down Y
  routingMode?: PipelineRoutingMode; // 'plan' (2D layout with manual/badge elevations) or 'isometric' (30/150/90 axes)
  nodeElevations?: Record<number, number>; // optional nodeNumber -> custom Z elevation in mm
}

export const DEFAULT_PIPELINE_EXPORT_OPTIONS: Required<Omit<PipelineCoordinateExportOptions, 'nodeElevations'>> & {
  nodeElevations?: Record<number, number>;
} = {
  branchName: '/CUSTOM-4"-PIPE/B1',
  startNodeNumber: 100,
  nodeIncrement: 10,
  defaultElevationZ: 100000, // 100,000 mm (100 m standard plant elevation)
  origin: { x: 0, y: 0 },
  invertYAxis: false,
  routingMode: 'plan',
  nodeElevations: undefined,
};

export interface PipelineBranchRow {
  branchName: string;
  nodeNumber: number;
  boreMm: number;
  wallThickness: number;
  p1: number;
  t1: number;
  t2?: number;
  t3?: number;
  fluidDensity?: number;
}

export type RestraintType = 'ANC' | 'GUIDE' | 'LINE-STOP' | '+Y' | '-Y' | 'SPR' | 'ROD';

export interface PipelineRestraintRow {
  branchName: string;
  nodeNumber: number;
  nodeName: string;
  restraintType: RestraintType;
  gap?: number;
  stiffness?: number;
  friction?: number;
  direction?: string;
}

export type ComponentType = 'VALVE' | 'CHECK' | 'FLANGE' | 'REDUCER' | 'PUMP' | 'METER' | 'BLIND';

export interface PipelineWeightRow {
  branchName: string;
  nodeNumber: number;
  componentType: ComponentType;
  rigid: boolean;
  endpoint: number;
  weight: number;
  componentRefNo: string;
}

export interface PipelineDtxrRow {
  branchName: string;
  nodeNumber: number;
  dtxr: string; // e.g. "DX=5 DY=12 DZ=-2"
}

export interface FullXmlBuilderModel {
  coordinateRows: PipelineCoordinateRow[];
  branchRows: PipelineBranchRow[];
  restraintRows: PipelineRestraintRow[];
  weightRows: PipelineWeightRow[];
  dtxrRows: PipelineDtxrRow[];
}

export interface StandardPipeSpec {
  nps: string; // e.g. "4\""
  dnMm: number; // e.g. 100
  outerDiameterMm: number; // e.g. 114.3
  wallThicknessStdMm: number; // e.g. 6.02
  defaultValveWeightKg: number; // e.g. 85
}

export const STANDARD_ASME_PIPE_SPECS: Record<string, StandardPipeSpec> = {
  '1/2"': { nps: '1/2"', dnMm: 15, outerDiameterMm: 21.3, wallThicknessStdMm: 2.77, defaultValveWeightKg: 4 },
  '3/4"': { nps: '3/4"', dnMm: 20, outerDiameterMm: 26.7, wallThicknessStdMm: 2.87, defaultValveWeightKg: 6 },
  '1"': { nps: '1"', dnMm: 25, outerDiameterMm: 33.4, wallThicknessStdMm: 3.38, defaultValveWeightKg: 9 },
  '1.5"': { nps: '1.5"', dnMm: 40, outerDiameterMm: 48.3, wallThicknessStdMm: 3.68, defaultValveWeightKg: 18 },
  '2"': { nps: '2"', dnMm: 50, outerDiameterMm: 60.3, wallThicknessStdMm: 3.91, defaultValveWeightKg: 25 },
  '3"': { nps: '3"', dnMm: 80, outerDiameterMm: 88.9, wallThicknessStdMm: 5.49, defaultValveWeightKg: 50 },
  '4"': { nps: '4"', dnMm: 100, outerDiameterMm: 114.3, wallThicknessStdMm: 6.02, defaultValveWeightKg: 85 },
  '6"': { nps: '6"', dnMm: 150, outerDiameterMm: 168.3, wallThicknessStdMm: 7.11, defaultValveWeightKg: 160 },
  '8"': { nps: '8"', dnMm: 200, outerDiameterMm: 219.1, wallThicknessStdMm: 8.18, defaultValveWeightKg: 280 },
  '10"': { nps: '10"', dnMm: 250, outerDiameterMm: 273.0, wallThicknessStdMm: 9.27, defaultValveWeightKg: 420 },
  '12"': { nps: '12"', dnMm: 300, outerDiameterMm: 323.8, wallThicknessStdMm: 9.53, defaultValveWeightKg: 600 },
  '14"': { nps: '14"', dnMm: 350, outerDiameterMm: 355.6, wallThicknessStdMm: 9.53, defaultValveWeightKg: 750 },
  '16"': { nps: '16"', dnMm: 400, outerDiameterMm: 406.4, wallThicknessStdMm: 9.53, defaultValveWeightKg: 950 },
  '18"': { nps: '18"', dnMm: 450, outerDiameterMm: 457.0, wallThicknessStdMm: 9.53, defaultValveWeightKg: 1200 },
  '20"': { nps: '20"', dnMm: 500, outerDiameterMm: 508.0, wallThicknessStdMm: 9.53, defaultValveWeightKg: 1500 },
  '24"': { nps: '24"', dnMm: 600, outerDiameterMm: 610.0, wallThicknessStdMm: 9.53, defaultValveWeightKg: 2200 },
};
