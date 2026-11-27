import { create } from 'zustand';
import type { CadClosedLoop, Point2D } from '../cad-geometry/types';
import type { CadExtrudedMesh3D } from '../cad-3d/types';
import type { Pdf3DAnnotationRecord } from '../cad-3d/pdf3dTypes';
import type { ClashAuditReport } from '../cad-3d/clashDetector';
import type { PipelineRoutingMode } from '../pipeline-geometry/types';
import type {
  Cad3DDockSettings,
  Cad3DViewMode,
  CadDraftingSettings,
  CadLiveCursorTelemetry,
  CadSnapType,
  CadToolMode,
  Piping3DRenderMode,
} from './types';
import { computeDraftingTelemetry } from './draftingMath';

export interface VectorPortRoiCaptureRequest {
  mode: 'pipe' | 'cad';
  includeTextLabels: boolean;
  attachBranchLabels: boolean;
  selectedLayer?: string;
}

export interface CadModelingState {
  toolMode: CadToolMode;
  drafting: CadDraftingSettings;
  telemetry: CadLiveCursorTelemetry;
  dock3d: Cad3DDockSettings;
  harvestedLoops: CadClosedLoop[];
  pdf3dAnnotations: Pdf3DAnnotationRecord[];
  selectedPdf3dId: string | null;
  activeLoadedU3DMesh: CadExtrudedMesh3D | null;
  pipingRenderMode: Piping3DRenderMode;
  pipingRoutingMode: PipelineRoutingMode;
  pipingBranchName: string;
  pipingElevationZ: number;
  clashMinClearanceMm: number;
  clashReport: ClashAuditReport | null;
  selectedClashId: string | null;
  vectorRoiCapture: VectorPortRoiCaptureRequest | null;
  vectorRoiStatus: string | null;
  vectorLayersDetected: string[];
  /** Progress state of the Layer 5/6 raster auto-trace pipeline. */
  rasterTraceStatus: 'idle' | 'rasterizing' | 'tracing' | 'done' | 'error';
  /** Optional ROI box saved when `Port Region` hits a scanned/raster area (Layer 6). */
  lastRasterRegionRect: { x: number; y: number; width: number; height: number } | null;
  /** Binarization algorithm preference for scanned/raster auto-trace (Layer 6). */
  rasterThresholdMethod: 'otsu' | 'bradley';
  /** Ramer-Douglas-Peucker simplification epsilon in pixels (Layer 6). */
  rasterRdpEpsilonPx: number;
  /** Minimum traced polyline length in pixels (Layer 6). */
  rasterMinLengthPx: number;
}

export interface CadModelingActions {
  setToolMode: (mode: CadToolMode) => void;
  toggleOrtho: () => void;
  togglePolarTracking: () => void;
  setPolarStep: (stepDeg: number) => void;
  toggleObjectSnap: () => void;
  toggleGridSnap: () => void;
  toggleGridVisible: () => void;
  setGridSpacing: (spacing: number) => void;
  updateCursor: (coords: { screen?: Point2D | null; world?: Point2D | null }) => void;
  setActiveAnchor: (anchor: Point2D | null) => void;
  setSnappedState: (point: Point2D | null, snapType: CadSnapType | null) => void;
  toggle3DDock: () => void;
  set3DDockOpen: (open: boolean) => void;
  setSelectedLoop: (loopId: string | null) => void;
  setExtrudeDepth: (depth: number) => void;
  setBevelSize: (size: number) => void;
  setViewMode: (mode: Cad3DViewMode) => void;
  setShadedColor: (color: string) => void;
  setWireframeColor: (color: string) => void;
  setHarvestedLoops: (loops: CadClosedLoop[]) => void;
  setPdf3dAnnotations: (annotations: Pdf3DAnnotationRecord[]) => void;
  setSelectedPdf3dId: (id: string | null) => void;
  setActiveLoadedU3DMesh: (mesh: CadExtrudedMesh3D | null) => void;
  setPipingRenderMode: (mode: Piping3DRenderMode) => void;
  setPipingRoutingMode: (mode: PipelineRoutingMode) => void;
  setPipingBranchName: (branch: string) => void;
  setPipingElevationZ: (zMm: number) => void;
  setClashMinClearanceMm: (mm: number) => void;
  setClashReport: (report: ClashAuditReport | null) => void;
  setSelectedClashId: (id: string | null) => void;
  startVectorRoiCapture: (req: VectorPortRoiCaptureRequest) => void;
  cancelVectorRoiCapture: () => void;
  setVectorRoiStatus: (status: string | null) => void;
  setVectorLayersDetected: (layers: string[]) => void;
  setRasterTraceStatus: (status: CadModelingState['rasterTraceStatus']) => void;
  setLastRasterRegionRect: (rect: CadModelingState['lastRasterRegionRect']) => void;
  setRasterThresholdMethod: (method: CadModelingState['rasterThresholdMethod']) => void;
  setRasterRdpEpsilonPx: (epsilonPx: number) => void;
  setRasterMinLengthPx: (minLenPx: number) => void;
  reset: () => void;
}

export type CadModelingStore = CadModelingState & CadModelingActions;

export const INITIAL_DRAFTING_SETTINGS: CadDraftingSettings = {
  gridVisible: true,
  gridSnapEnabled: false,
  gridSpacing: 10,
  orthoEnabled: false,
  polarTrackingEnabled: true,
  polarAngleStepDeg: 45,
  objectSnapEnabled: true,
  objectSnapTolerance: 8,
};

export const INITIAL_TELEMETRY: CadLiveCursorTelemetry = {
  screenCoords: null,
  worldCoords: null,
  activeAnchor: null,
  activeLength: null,
  activeAngleDeg: null,
  snappedPoint: null,
  activeSnapType: null,
};

export const INITIAL_DOCK_3D: Cad3DDockSettings = {
  isOpen: false,
  selectedLoopId: null,
  extrudeDepth: 20,
  bevelSize: 2,
  viewMode: 'shaded',
  wireframeColor: '#00ffff',
  shadedColor: '#3b82f6',
};

export const useCadModelingStore = create<CadModelingStore>((set, get) => ({
  toolMode: 'select',
  drafting: { ...INITIAL_DRAFTING_SETTINGS },
  telemetry: { ...INITIAL_TELEMETRY },
  dock3d: { ...INITIAL_DOCK_3D },
  harvestedLoops: [],
  pdf3dAnnotations: [],
  selectedPdf3dId: null,
  activeLoadedU3DMesh: null,
  pipingRenderMode: 'wireframe',
  pipingRoutingMode: 'plan',
  pipingBranchName: '/CUSTOM-4"-PIPE/B1',
  pipingElevationZ: 100000,
  clashMinClearanceMm: 25,
  clashReport: null,
  selectedClashId: null,
  vectorRoiCapture: null,
  vectorRoiStatus: null,
  vectorLayersDetected: [],
  rasterTraceStatus: 'idle',
  lastRasterRegionRect: null,
  rasterThresholdMethod: 'otsu',
  rasterRdpEpsilonPx: 1.5,
  rasterMinLengthPx: 20,

  setToolMode: (mode) => set({ toolMode: mode }),

  toggleOrtho: () =>
    set((state) => ({
      drafting: {
        ...state.drafting,
        orthoEnabled: !state.drafting.orthoEnabled,
        // Ortho and Polar are mutually exclusive in standard CAD ergonomics
        polarTrackingEnabled: !state.drafting.orthoEnabled ? false : state.drafting.polarTrackingEnabled,
      },
    })),

  togglePolarTracking: () =>
    set((state) => ({
      drafting: {
        ...state.drafting,
        polarTrackingEnabled: !state.drafting.polarTrackingEnabled,
        orthoEnabled: !state.drafting.polarTrackingEnabled ? false : state.drafting.orthoEnabled,
      },
    })),

  setPolarStep: (stepDeg) =>
    set((state) => ({
      drafting: { ...state.drafting, polarAngleStepDeg: Math.max(1, stepDeg) },
    })),

  toggleObjectSnap: () =>
    set((state) => ({
      drafting: { ...state.drafting, objectSnapEnabled: !state.drafting.objectSnapEnabled },
    })),

  toggleGridSnap: () =>
    set((state) => ({
      drafting: { ...state.drafting, gridSnapEnabled: !state.drafting.gridSnapEnabled },
    })),

  toggleGridVisible: () =>
    set((state) => ({
      drafting: { ...state.drafting, gridVisible: !state.drafting.gridVisible },
    })),

  setGridSpacing: (spacing) =>
    set((state) => ({
      drafting: { ...state.drafting, gridSpacing: Math.max(1, spacing) },
    })),

  updateCursor: ({ screen, world }) =>
    set((state) => {
      const worldCoords = world !== undefined ? world : state.telemetry.worldCoords;
      const screenCoords = screen !== undefined ? screen : state.telemetry.screenCoords;

      let activeLength: number | null = null;
      let activeAngleDeg: number | null = null;

      if (state.telemetry.activeAnchor && worldCoords) {
        const t = computeDraftingTelemetry(state.telemetry.activeAnchor, worldCoords);
        activeLength = t.length;
        activeAngleDeg = t.angleDeg;
      }

      return {
        telemetry: {
          ...state.telemetry,
          worldCoords,
          screenCoords,
          activeLength,
          activeAngleDeg,
        },
      };
    }),

  setActiveAnchor: (anchor) =>
    set((state) => {
      let activeLength: number | null = null;
      let activeAngleDeg: number | null = null;

      if (anchor && state.telemetry.worldCoords) {
        const t = computeDraftingTelemetry(anchor, state.telemetry.worldCoords);
        activeLength = t.length;
        activeAngleDeg = t.angleDeg;
      }

      return {
        telemetry: {
          ...state.telemetry,
          activeAnchor: anchor,
          activeLength,
          activeAngleDeg,
        },
      };
    }),

  setSnappedState: (point, snapType) =>
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        snappedPoint: point,
        activeSnapType: snapType,
      },
    })),

  toggle3DDock: () =>
    set((state) => ({
      dock3d: { ...state.dock3d, isOpen: !state.dock3d.isOpen },
    })),

  set3DDockOpen: (open) =>
    set((state) => ({
      dock3d: { ...state.dock3d, isOpen: open },
    })),

  setSelectedLoop: (loopId) =>
    set((state) => ({
      dock3d: { ...state.dock3d, selectedLoopId: loopId },
    })),

  setExtrudeDepth: (depth) =>
    set((state) => ({
      dock3d: { ...state.dock3d, extrudeDepth: Math.max(0.1, depth) },
    })),

  setBevelSize: (size) =>
    set((state) => ({
      dock3d: { ...state.dock3d, bevelSize: Math.max(0, size) },
    })),

  setViewMode: (mode) =>
    set((state) => ({
      dock3d: { ...state.dock3d, viewMode: mode },
    })),

  setShadedColor: (color) =>
    set((state) => ({
      dock3d: { ...state.dock3d, shadedColor: color },
    })),

  setWireframeColor: (color) =>
    set((state) => ({
      dock3d: { ...state.dock3d, wireframeColor: color },
    })),

  setHarvestedLoops: (loops) =>
    set({
      harvestedLoops: loops,
      // Default to first loop if none selected
      dock3d: {
        ...get().dock3d,
        selectedLoopId: get().dock3d.selectedLoopId ?? (loops.length > 0 ? loops[0].id : null),
      },
    }),

  setPdf3dAnnotations: (annotations) =>
    set((state) => ({
      pdf3dAnnotations: annotations,
      selectedPdf3dId:
        annotations.some((a) => a.id === state.selectedPdf3dId)
          ? state.selectedPdf3dId
          : (annotations[0]?.id ?? null),
    })),

  setSelectedPdf3dId: (id) => set({ selectedPdf3dId: id }),

  setActiveLoadedU3DMesh: (mesh) => set({ activeLoadedU3DMesh: mesh }),

  setPipingRenderMode: (mode) => set({ pipingRenderMode: mode }),

  setPipingRoutingMode: (mode) => set({ pipingRoutingMode: mode }),

  setPipingBranchName: (branch) => set({ pipingBranchName: branch }),

  setPipingElevationZ: (zMm) =>
    set({ pipingElevationZ: Number.isFinite(zMm) ? zMm : 100000 }),

  setClashMinClearanceMm: (mm) =>
    set({ clashMinClearanceMm: Math.max(0, Number.isFinite(mm) ? mm : 0) }),

  setClashReport: (report) => set({ clashReport: report }),

  setSelectedClashId: (id) => set({ selectedClashId: id }),

  startVectorRoiCapture: (req) =>
    set({
      vectorRoiCapture: req,
      vectorRoiStatus: null,
      lastRasterRegionRect: null,
      rasterTraceStatus: 'idle',
    }),

  cancelVectorRoiCapture: () => set({ vectorRoiCapture: null }),

  setVectorRoiStatus: (status) => set({ vectorRoiStatus: status }),

  setVectorLayersDetected: (layers) => set({ vectorLayersDetected: layers }),

  setRasterTraceStatus: (status) => set({ rasterTraceStatus: status }),

  setLastRasterRegionRect: (rect) => set({ lastRasterRegionRect: rect }),

  setRasterThresholdMethod: (method) => set({ rasterThresholdMethod: method }),

  setRasterRdpEpsilonPx: (epsilonPx) =>
    set({ rasterRdpEpsilonPx: Math.max(0.25, Math.min(10, Number.isFinite(epsilonPx) ? epsilonPx : 1.5)) }),

  setRasterMinLengthPx: (minLenPx) =>
    set({ rasterMinLengthPx: Math.max(4, Math.min(200, Number.isFinite(minLenPx) ? minLenPx : 20)) }),

  reset: () =>
    set({
      toolMode: 'select',
      drafting: { ...INITIAL_DRAFTING_SETTINGS },
      telemetry: { ...INITIAL_TELEMETRY },
      dock3d: { ...INITIAL_DOCK_3D },
      harvestedLoops: [],
      pdf3dAnnotations: [],
      selectedPdf3dId: null,
      activeLoadedU3DMesh: null,
      pipingRenderMode: 'wireframe',
      pipingRoutingMode: 'plan',
      pipingBranchName: '/CUSTOM-4"-PIPE/B1',
      pipingElevationZ: 100000,
      clashMinClearanceMm: 25,
      clashReport: null,
      selectedClashId: null,
      vectorRoiCapture: null,
      vectorRoiStatus: null,
      vectorLayersDetected: [],
      rasterTraceStatus: 'idle',
      lastRasterRegionRect: null,
      rasterThresholdMethod: 'otsu',
      rasterRdpEpsilonPx: 1.5,
      rasterMinLengthPx: 20,
    }),
}));
