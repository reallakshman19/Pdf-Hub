/**
 * Tabular Piping & XML Builder State Store Types.
 *
 * Models the 5 CAESAR II / XML Builder tables:
 * 1. Coordinates (Node, X, Y, Z, Diameter, Length)
 * 2. Branches (Branch, Node, Bore, Thickness, P1, T1)
 * 3. Restraints (Node, Tag, Type, Friction, Stiffness, Gap)
 * 4. Weights (Node, ComponentType, Weight, RefNo)
 * 5. DTXR / Valves & Displacements (Node, DTXR, Facing, Rating)
 *
 * Invariant INV-4: Pure TypeScript domain types without UI or library dependencies.
 */

import type { PdfAnnotation, ScaleCalibration } from '../../annotations/types';
import type {
  FullXmlBuilderModel,
  PipelineBranchRow,
  PipelineCoordinateExportOptions,
  PipelineCoordinateRow,
  PipelineDtxrRow,
  PipelineRestraintRow,
  PipelineRoutingMode,
  PipelineWeightRow,
} from '../types';

export type TableKind = 'coordinates' | 'branches' | 'restraints' | 'weights' | 'dtxr';

export interface PipingTableState {
  // Tab & View Mode
  activeTableTab: TableKind;
  scope: 'page' | 'all';
  routingMode: PipelineRoutingMode;
  branchName: string;
  defaultElevationZ: number;

  // 5 Data Tables
  coordinateRows: PipelineCoordinateRow[];
  branchRows: PipelineBranchRow[];
  restraintRows: PipelineRestraintRow[];
  weightRows: PipelineWeightRow[];
  dtxrRows: PipelineDtxrRow[];

  // Dirty cell tracking: key is `${tableKind}:${nodeNumber}:${field}`
  dirtyCells: Record<string, boolean>;

  // Selection & Telemetry
  selectedNodeNumber: number | null;
  selectedRowIndex: number | null;
  isSyncing: boolean;
  lastSyncedTimestamp: number;
}

export interface PipingTableActions {
  setActiveTableTab: (tab: TableKind) => void;
  setScope: (scope: 'page' | 'all') => void;
  setRoutingMode: (mode: PipelineRoutingMode) => void;
  setBranchName: (name: string) => void;
  setDefaultElevationZ: (z: number) => void;

  setSelectedNodeNumber: (nodeNumber: number | null) => void;
  setSelectedRowIndex: (index: number | null) => void;

  // Cell Updates (marks cell as dirty)
  updateCoordinateRow: (nodeNumber: number, patch: Partial<PipelineCoordinateRow>) => void;
  updateBranchRow: (nodeNumber: number, patch: Partial<PipelineBranchRow>) => void;
  updateRestraintRow: (nodeNumber: number, patch: Partial<PipelineRestraintRow>) => void;
  updateWeightRow: (nodeNumber: number, patch: Partial<PipelineWeightRow>) => void;
  updateDtxrRow: (nodeNumber: number, patch: Partial<PipelineDtxrRow>) => void;

  // Dirty state management
  clearDirtyCells: () => void;

  // Forward Sync: Annotations -> Table Store
  syncFromAnnotations: (
    annotations: PdfAnnotation[],
    getCalibration: (page: number) => ScaleCalibration,
    options?: Partial<PipelineCoordinateExportOptions>,
    currentPage?: number,
  ) => void;

  // Reverse Sync calculation: Generates annotation patches for modified cells
  computeAnnotationPatches: (
    annotations: PdfAnnotation[],
    getCalibration: (page: number) => ScaleCalibration,
  ) => Array<{ id: string; patch: Partial<PdfAnnotation> }>;

  // TSV Export & Paste Import
  pasteTsvToTable: (tableKind: TableKind, tsvText: string) => boolean;
  getFullModel: () => FullXmlBuilderModel;
}
