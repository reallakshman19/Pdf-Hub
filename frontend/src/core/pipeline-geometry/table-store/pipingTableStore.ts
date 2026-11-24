/**
 * Piping Table Zustand Store with Dirty Tracking & Bidirectional Round-Trip.
 *
 * Implements the 5 CAESAR II / XML Builder tables:
 * - Coordinates
 * - Branches
 * - Restraints
 * - Weights
 * - DTXR (Valves & Displacements)
 *
 * Invariant INV-4: Pure TypeScript state store without DOM or library dependencies.
 */

import { create } from 'zustand';
import { extractFullXmlBuilderModel } from '../pipelineModelAggregator';
import type {
  FullXmlBuilderModel,
  PipelineCoordinateExportOptions,
} from '../types';
import {
  computeCoordinatePatches,
  computeRestraintPatches,
  parseCoordinateTsv,
} from './reverseTransform';
import type { PipingTableActions, PipingTableState } from './types';

export const usePipingTableStore = create<PipingTableState & PipingTableActions>((set, get) => ({
  // Tab & View Defaults
  activeTableTab: 'coordinates',
  scope: 'page',
  routingMode: 'plan',
  branchName: '/CUSTOM-4"-PIPE/B1',
  defaultElevationZ: 100000,

  // 5 Data Tables
  coordinateRows: [],
  branchRows: [],
  restraintRows: [],
  weightRows: [],
  dtxrRows: [],

  // Dirty cell tracking
  dirtyCells: {},

  // Selection & Telemetry
  selectedNodeNumber: null,
  selectedRowIndex: null,
  isSyncing: false,
  lastSyncedTimestamp: 0,

  setActiveTableTab: (activeTableTab) => set({ activeTableTab }),
  setScope: (scope) => set({ scope }),
  setRoutingMode: (routingMode) => set({ routingMode }),
  setBranchName: (branchName) => set({ branchName }),
  setDefaultElevationZ: (defaultElevationZ) => set({ defaultElevationZ }),

  setSelectedNodeNumber: (selectedNodeNumber) => set({ selectedNodeNumber }),
  setSelectedRowIndex: (selectedRowIndex) => set({ selectedRowIndex }),

  // Cell Updates
  updateCoordinateRow: (nodeNumber, patch) => {
    set((state) => {
      const nextDirty = { ...state.dirtyCells };
      Object.keys(patch).forEach((key) => {
        nextDirty[`coordinates:${nodeNumber}:${key}`] = true;
      });

      const nextRows = state.coordinateRows.map((row) =>
        row.nodeNumber === nodeNumber ? { ...row, ...patch } : row,
      );

      return {
        coordinateRows: nextRows,
        dirtyCells: nextDirty,
      };
    });
  },

  updateBranchRow: (nodeNumber, patch) => {
    set((state) => {
      const nextDirty = { ...state.dirtyCells };
      Object.keys(patch).forEach((key) => {
        nextDirty[`branches:${nodeNumber}:${key}`] = true;
      });

      const nextRows = state.branchRows.map((row) =>
        row.nodeNumber === nodeNumber ? { ...row, ...patch } : row,
      );

      return {
        branchRows: nextRows,
        dirtyCells: nextDirty,
      };
    });
  },

  updateRestraintRow: (nodeNumber, patch) => {
    set((state) => {
      const nextDirty = { ...state.dirtyCells };
      Object.keys(patch).forEach((key) => {
        nextDirty[`restraints:${nodeNumber}:${key}`] = true;
      });

      const nextRows = state.restraintRows.map((row) =>
        row.nodeNumber === nodeNumber ? { ...row, ...patch } : row,
      );

      return {
        restraintRows: nextRows,
        dirtyCells: nextDirty,
      };
    });
  },

  updateWeightRow: (nodeNumber, patch) => {
    set((state) => {
      const nextDirty = { ...state.dirtyCells };
      Object.keys(patch).forEach((key) => {
        nextDirty[`weights:${nodeNumber}:${key}`] = true;
      });

      const nextRows = state.weightRows.map((row) =>
        row.nodeNumber === nodeNumber ? { ...row, ...patch } : row,
      );

      return {
        weightRows: nextRows,
        dirtyCells: nextDirty,
      };
    });
  },

  updateDtxrRow: (nodeNumber, patch) => {
    set((state) => {
      const nextDirty = { ...state.dirtyCells };
      Object.keys(patch).forEach((key) => {
        nextDirty[`dtxr:${nodeNumber}:${key}`] = true;
      });

      const nextRows = state.dtxrRows.map((row) =>
        row.nodeNumber === nodeNumber ? { ...row, ...patch } : row,
      );

      return {
        dtxrRows: nextRows,
        dirtyCells: nextDirty,
      };
    });
  },

  clearDirtyCells: () => set({ dirtyCells: {} }),

  // Forward Sync from Annotations, respecting dirty cells
  syncFromAnnotations: (annotations, getCalibration, options, currentPage = 1) => {
    const { scope, routingMode, branchName, defaultElevationZ, dirtyCells } = get();

    const filtered =
      scope === 'page'
        ? annotations.filter((a) => a.pageNumber === currentPage)
        : annotations;

    const opts: PipelineCoordinateExportOptions = {
      branchName,
      routingMode,
      defaultElevationZ,
      ...options,
    };

    const extracted = extractFullXmlBuilderModel(filtered, getCalibration, opts);

    // Merge extracted coordinate rows while preserving dirty cells
    const mergedCoordinates = extracted.coordinateRows.map((extRow) => {
      const existing = get().coordinateRows.find((r) => r.nodeNumber === extRow.nodeNumber);
      if (!existing) return extRow;

      const merged = { ...extRow };
      if (dirtyCells[`coordinates:${extRow.nodeNumber}:x`]) merged.x = existing.x;
      if (dirtyCells[`coordinates:${extRow.nodeNumber}:y`]) merged.y = existing.y;
      if (dirtyCells[`coordinates:${extRow.nodeNumber}:z`]) merged.z = existing.z;
      if (dirtyCells[`coordinates:${extRow.nodeNumber}:branchName`]) merged.branchName = existing.branchName;
      return merged;
    });

    set({
      coordinateRows: mergedCoordinates,
      branchRows: extracted.branchRows,
      restraintRows: extracted.restraintRows,
      weightRows: extracted.weightRows,
      dtxrRows: extracted.dtxrRows,
      lastSyncedTimestamp: Date.now(),
    });
  },

  // Reverse Sync: generates patches for annotations from dirty table cells
  computeAnnotationPatches: (annotations, getCalibration) => {
    const { coordinateRows, restraintRows, dirtyCells } = get();
    const coordPatches = computeCoordinatePatches(annotations, coordinateRows, dirtyCells, getCalibration);
    const restraintPatches = computeRestraintPatches(annotations, restraintRows, dirtyCells);
    return [...coordPatches, ...restraintPatches];
  },

  // TSV Paste handling
  pasteTsvToTable: (tableKind, tsvText) => {
    if (tableKind === 'coordinates') {
      const parsed = parseCoordinateTsv(tsvText);
      if (parsed.length === 0) return false;

      parsed.forEach((item) => {
        if (typeof item.nodeNumber === 'number') {
          get().updateCoordinateRow(item.nodeNumber, item);
        }
      });
      return true;
    }
    return false;
  },

  getFullModel: (): FullXmlBuilderModel => {
    const { coordinateRows, branchRows, restraintRows, weightRows, dtxrRows } = get();
    return {
      coordinateRows,
      branchRows,
      restraintRows,
      weightRows,
      dtxrRows,
    };
  },
}));
