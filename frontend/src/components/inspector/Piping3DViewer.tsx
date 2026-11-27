import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { FullXmlBuilderModel, PipelineCoordinateRow } from '@/core/pipeline-geometry/types';
import {
  Rotate3d,
  Compass,
  Maximize2,
  PenTool,
  Box,
  ShieldAlert,
  ShieldCheck,
  FileBox,
} from 'lucide-react';
import { useCadModelingStore } from '@/core/cad-modeling/store';
import { useSessionStore } from '@/core/session/store';
import { buildVolumetricPipingScene } from '@/core/cad-3d/pipingVolumeBuilder';
import { runSpatialClashAudit } from '@/core/cad-3d/clashDetector';
import {
  renderSceneMeshesToCanvas2D,
  type Camera3D,
  type SceneRenderMeshItem,
} from '@/core/cad-3d/software3dRenderer';
import { WebGl3DRenderer } from '@/core/cad-3d/webgl3dRenderer';
import { WebGlDisposalManager } from '@/core/cad-3d/webglDisposal';
import { embedU3DMeshInPdf } from '@/core/cad-3d/pdf3dAnnotation';

export interface Piping3DViewerProps {
  model: FullXmlBuilderModel;
  selectedNode?: number | null;
  onSelectNode?: (nodeNumber: number) => void;
  className?: string;
  isMainCanvas?: boolean;
  onReturnTo2d?: () => void;
  harvestedLoopCount?: number;
  onOpenExtrusionDock?: () => void;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  screenX: number;
  screenY: number;
  depth: number;
  node: PipelineCoordinateRow;
}

// Default standard isometric viewing angles
const DEFAULT_AZIMUTH = Math.PI / 4; // 45°
const DEFAULT_ELEVATION = 0.6155; // 35.26° = asin(1/sqrt(3))

export const Piping3DViewer: React.FC<Piping3DViewerProps> = ({
  model,
  selectedNode,
  onSelectNode,
  className = '',
  isMainCanvas = false,
  onReturnTo2d,
  harvestedLoopCount = 0,
  onOpenExtrusionDock,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportHostRef = useRef<HTMLDivElement>(null);
  const volumetricCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const disposalManagerRef = useRef<WebGlDisposalManager | null>(null);
  const webglRendererRef = useRef<WebGl3DRenderer | null>(null);
  const webglAttemptedRef = useRef(false);

  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number }>(() => ({
    width: isMainCanvas ? 800 : 360,
    height: isMainCanvas ? 500 : 220,
  }));

  useEffect(() => {
    const host = viewportHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(120, Math.round(rect.width));
      const h = Math.max(120, Math.round(rect.height));
      setMeasuredSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    updateSize();
    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        updateSize();
      });
    };
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(host);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [isMainCanvas]);

  const {
    pipingRenderMode,
    clashMinClearanceMm,
    selectedClashId,
    setPipingRenderMode,
    setClashMinClearanceMm,
    setClashReport,
    setSelectedClashId,
  } = useCadModelingStore();
  const workingBytes = useSessionStore((s) => s.workingBytes);

  // Camera & view state
  const [azimuth, setAzimuth] = useState<number>(DEFAULT_AZIMUTH);
  const [elevation, setElevation] = useState<number>(DEFAULT_ELEVATION);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [exporting3dPdf, setExporting3dPdf] = useState(false);

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const coordinateRows = model.coordinateRows;

  // Compute 3D bounding box and center
  const bounds = useMemo(() => {
    if (coordinateRows.length === 0) {
      return {
        center: { x: 0, y: 0, z: 100000 },
        span: 10000,
        min: { x: 0, y: 0, z: 100000 },
        max: { x: 0, y: 0, z: 100000 },
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const r of coordinateRows) {
      if (r.x < minX) minX = r.x;
      if (r.x > maxX) maxX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.y > maxY) maxY = r.y;
      if (r.z < minZ) minZ = r.z;
      if (r.z > maxZ) maxZ = r.z;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX, spanY, spanZ, 2000); // minimum 2 meters span

    return {
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2,
      },
      span,
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  }, [coordinateRows]);

  // Dynamic viewport pixel dimensions (1:1 via ResizeObserver with test fallback)
  const viewWidth = measuredSize.width;
  const viewHeight = measuredSize.height;

  // Camera auto-focus: while a node is selected the view stays centred on it
  // through rotate/zoom/reset; otherwise the free pan state applies.
  const focusPan = useMemo<{ x: number; y: number } | null>(() => {
    if (selectedNode == null) return null;
    const node = coordinateRows.find((r) => r.nodeNumber === selectedNode);
    if (!node) return null;
    const rx = node.x - bounds.center.x;
    const ry = node.y - bounds.center.y;
    const rz = node.z - bounds.center.z;
    const cosA = Math.cos(azimuth);
    const sinA = Math.sin(azimuth);
    const x1 = rx * cosA - ry * sinA;
    const y1 = rx * sinA + ry * cosA;
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);
    const baseScale = ((Math.min(viewWidth, viewHeight) * 0.65) / bounds.span) * zoom;
    return {
      x: -x1 * baseScale,
      y: (rz * cosE + y1 * sinE) * baseScale,
    };
  }, [selectedNode, coordinateRows, bounds, azimuth, elevation, zoom, viewWidth, viewHeight]);
  const effectivePan = focusPan ?? pan;

  // Project a 3D world coordinate (X East, Y North, Z Elevation) to 2D screen coordinate
  const project3D = useCallback(
    (pt: Point3D, width: number, height: number): { x: number; y: number; depth: number } => {
      // Relative to center
      const rx = pt.x - bounds.center.x;
      const ry = pt.y - bounds.center.y;
      const rz = pt.z - bounds.center.z;

      // Azimuth rotation around vertical Z axis
      const cosA = Math.cos(azimuth);
      const sinA = Math.sin(azimuth);
      const x1 = rx * cosA - ry * sinA;
      const y1 = rx * sinA + ry * cosA;
      const z1 = rz;

      // Elevation rotation (pitch)
      const cosE = Math.cos(elevation);
      const sinE = Math.sin(elevation);

      // Depth into screen
      const depth = y1 * cosE - z1 * sinE;

      // Screen projection: X is horizontal, Z and Y tilt into vertical
      const baseScale = (Math.min(width, height) * 0.65 / bounds.span) * zoom;
      const screenX = width / 2 + effectivePan.x + x1 * baseScale;
      const screenY = height / 2 + effectivePan.y - (z1 * cosE + y1 * sinE) * baseScale;

      return { x: screenX, y: screenY, depth };
    },
    [bounds, azimuth, elevation, zoom, effectivePan],
  );


  // Project all coordinate nodes
  const projectedNodes = useMemo<ProjectedPoint[]>(() => {
    return coordinateRows.map((node) => {
      const proj = project3D({ x: node.x, y: node.y, z: node.z }, viewWidth, viewHeight);
      return {
        screenX: proj.x,
        screenY: proj.y,
        depth: proj.depth,
        node,
      };
    });
  }, [coordinateRows, project3D, viewWidth, viewHeight]);

  // Map nodeNumber -> ProjectedPoint
  const nodeMap = useMemo(() => {
    const map = new Map<number, ProjectedPoint>();
    for (const p of projectedNodes) {
      map.set(p.node.nodeNumber, p);
    }
    return map;
  }, [projectedNodes]);

  // Group pipe runs by branch to connect sequential nodes
  const pipeSegments = useMemo(() => {
    const segs: Array<{
      p1: ProjectedPoint;
      p2: ProjectedPoint;
      branchName: string;
      lengthMm?: number;
    }> = [];

    for (let i = 0; i < projectedNodes.length - 1; i++) {
      const n1 = projectedNodes[i];
      const n2 = projectedNodes[i + 1];
      if (n1.node.branchName === n2.node.branchName) {
        segs.push({
          p1: n1,
          p2: n2,
          branchName: n1.node.branchName,
          lengthMm: n1.node.lengthToNextMm,
        });
      }
    }
    return segs;
  }, [projectedNodes]);

  const { restraintRows, weightRows } = model;

  // Support lookup by nodeNumber
  const restraintMap = useMemo(() => {
    const map = new Map<number, typeof restraintRows[0]>();
    for (const r of restraintRows) {
      map.set(r.nodeNumber, r);
    }
    return map;
  }, [restraintRows]);

  // Valve / Weight component lookup by nodeNumber
  const weightMap = useMemo(() => {
    const map = new Map<number, typeof weightRows[0]>();
    for (const w of weightRows) {
      map.set(w.nodeNumber, w);
    }
    return map;
  }, [weightRows]);

  // Triad Axes projection for bottom-left orientation compass
  const triad = useMemo(() => {
    const triadLen = isMainCanvas ? 38 : 28;
    const origin = { x: isMainCanvas ? 48 : 38, y: viewHeight - (isMainCanvas ? 44 : 34) };

    const cosA = Math.cos(azimuth);
    const sinA = Math.sin(azimuth);
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);

    // +X Axis (East)
    const xEnd = {
      x: origin.x + (triadLen * cosA),
      y: origin.y - (triadLen * sinA * sinE),
    };

    // +Y Axis (North)
    const yEnd = {
      x: origin.x - (triadLen * sinA),
      y: origin.y - (triadLen * cosA * sinE),
    };

    // +Z Axis (Up / Elevation)
    const zEnd = {
      x: origin.x,
      y: origin.y - (triadLen * cosE),
    };

    return { origin, xEnd, yEnd, zEnd };
  }, [azimuth, elevation, viewHeight, isMainCanvas]);

  // Volumetric 3D solid piping & Spatial Hash Clash Audit
  const volumetricScene = useMemo(() => {
    if (pipingRenderMode !== 'volumetric' || coordinateRows.length === 0) return null;
    return buildVolumetricPipingScene(model);
  }, [pipingRenderMode, model, coordinateRows.length]);

  const localClashReport = useMemo(() => {
    if (!volumetricScene) return null;
    return runSpatialClashAudit(volumetricScene.parts, {
      minClearanceMm: clashMinClearanceMm,
    });
  }, [volumetricScene, clashMinClearanceMm]);

  useEffect(() => {
    setClashReport(localClashReport);
  }, [localClashReport, setClashReport]);

  useEffect(() => {
    const manager = new WebGlDisposalManager();
    disposalManagerRef.current = manager;
    return () => {
      webglRendererRef.current?.dispose();
      webglRendererRef.current = null;
      webglAttemptedRef.current = false;
      manager.dispose();
      disposalManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pipingRenderMode !== 'volumetric') {
      webglRendererRef.current?.dispose();
      webglRendererRef.current = null;
      webglAttemptedRef.current = false;
      return;
    }

    const canvas = volumetricCanvasRef.current;
    if (!canvas || !volumetricScene || volumetricScene.parts.length === 0) return;

    const severityByPart = new Map<string, 'hard' | 'clearance' | 'selected'>();
    if (localClashReport) {
      for (const issue of localClashReport.clashes) {
        const isSel = selectedClashId === issue.id;
        const sev: 'hard' | 'clearance' | 'selected' = isSel
          ? 'selected'
          : issue.severity === 'HARD_CLASH'
            ? 'hard'
            : 'clearance';
        severityByPart.set(issue.partAId, sev);
        severityByPart.set(issue.partBId, sev);
      }
    }

    const renderItems: SceneRenderMeshItem[] = volumetricScene.parts.map((part) => ({
      id: part.id,
      mesh: part.mesh,
      color: part.color,
      highlightSeverity: severityByPart.get(part.id) ?? null,
    }));

    const cam3d: Camera3D = {
      azimuthDeg: (azimuth * 180) / Math.PI,
      elevationDeg: (elevation * 180) / Math.PI,
      distance: Math.max(50, (bounds.span * 1.6) / zoom),
      target: volumetricScene.centroid,
      panOffset: effectivePan,
    };

    if (!webglAttemptedRef.current) {
      webglAttemptedRef.current = true;
      webglRendererRef.current = WebGl3DRenderer.tryCreate(
        canvas,
        disposalManagerRef.current ?? undefined,
      );
    }

    if (webglRendererRef.current) {
      webglRendererRef.current.renderScene(renderItems, cam3d, {
        viewMode: 'shaded',
        pivotCenter: volumetricScene.centroid,
        drawGroundGrid: true,
      });
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSceneMeshesToCanvas2D(ctx, renderItems, cam3d, {
      viewMode: 'shaded',
      pivotCenter: volumetricScene.centroid,
      drawGroundGrid: true,
    });
  }, [
    pipingRenderMode,
    volumetricScene,
    localClashReport,
    selectedClashId,
    azimuth,
    elevation,
    zoom,
    bounds.span,
    effectivePan,
    viewWidth,
    viewHeight,
  ]);

  const handleExport3DPdf = async () => {
    const scene = volumetricScene ?? buildVolumetricPipingScene(model);
    if (scene.parts.length === 0) return;
    setExporting3dPdf(true);
    try {
      const res = await embedU3DMeshInPdf(
        workingBytes ?? null,
        scene.parts.map((p) => p.mesh),
        {
          annotationName: 'DocCraft_Piping_DigitalTwin',
          viewName: 'Piping Volumetric ISO',
          compressStream: true,
        },
      );
      if (typeof document !== 'undefined') {
        const blob = new Blob([new Uint8Array(res.pdfBytes)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'piping_3d_digital_twin.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting3dPdf(false);
    }
  };

  // Mouse drag handlers for real-time 3D rotation
  const handlePointerDown = (e: React.PointerEvent<Element>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<Element>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    // Orbit: horizontal drag = azimuth, vertical drag = elevation
    setAzimuth((prev) => prev + dx * 0.012);
    setElevation((prev) => {
      const next = prev + dy * 0.012;
      // Clamp elevation between -85° and +85° to prevent camera flipping
      return Math.max(-1.45, Math.min(1.45, next));
    });
  };

  const handlePointerUp = (e: React.PointerEvent<Element>) => {
    isDraggingRef.current = false;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Zoom with mouse wheel
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((prev) => Math.max(0.3, Math.min(5.0, prev * factor)));
  };

  // Preset camera views
  const handleSetView = (view: 'iso' | 'plan' | 'front' | 'side' | 'reset') => {
    if (view === 'iso') {
      setAzimuth(DEFAULT_AZIMUTH);
      setElevation(DEFAULT_ELEVATION);
    } else if (view === 'plan') {
      setAzimuth(0);
      setElevation(Math.PI / 2 - 0.01);
    } else if (view === 'front') {
      setAzimuth(0);
      setElevation(0);
    } else if (view === 'side') {
      setAzimuth(Math.PI / 2);
      setElevation(0);
    } else if (view === 'reset') {
      setAzimuth(DEFAULT_AZIMUTH);
      setElevation(DEFAULT_ELEVATION);
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
    }
  };

  const activeHoverOrSelectedNode = hoveredNode ?? selectedNode;
  const activeNodeData = activeHoverOrSelectedNode ? nodeMap.get(activeHoverOrSelectedNode)?.node : null;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`relative flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900 text-white overflow-hidden shadow-xs select-none ${className}`}
      data-testid="piping-3d-viewer"
    >
      {/* Top Header & Viewport Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-950/70 border-b border-slate-800/80 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Rotate3d className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[10px]">
            {isMainCanvas ? '3D Piping Space (Main Canvas)' : '3D Piping Wireframe'}
          </span>
          <span className="text-[9px] text-slate-400 font-mono">
            ({coordinateRows.length} nodes)
          </span>
        </div>

        {/* Render Mode + Camera Preset Quick Buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            data-testid="piping-mode-wireframe"
            onClick={() => setPipingRenderMode('wireframe')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              pipingRenderMode === 'wireframe'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Isometric centerline wireframe"
          >
            Stick
          </button>
          <button
            type="button"
            data-testid="piping-mode-volumetric"
            onClick={() => setPipingRenderMode('volumetric')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              pipingRenderMode === 'volumetric'
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-cyan-300 hover:bg-slate-700'
            }`}
            title="Volumetric 3D solid pipes, toroid elbows & spatial clash audit"
          >
            Solid 3D
          </button>
          <button
            type="button"
            data-testid="piping-btn-export-3dpdf"
            disabled={coordinateRows.length === 0 || exporting3dPdf}
            onClick={() => void handleExport3DPdf()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-emerald-300 hover:bg-slate-700 disabled:opacity-40"
            title="Export piping network as native ECMA-363 U3D 3D PDF"
          >
            <FileBox className="w-3 h-3" />
            <span>3D PDF</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetView('iso')}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-cyan-300 hover:bg-slate-700"
            title="Isometric standard view (35.26° x 45°)"
          >
            ISO
          </button>
          <button
            type="button"
            onClick={() => handleSetView('plan')}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Plan Top-Down view (X-Y)"
          >
            Plan
          </button>
          <button
            type="button"
            onClick={() => handleSetView('front')}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Front Elevation view (X-Z)"
          >
            Elev
          </button>
          <button
            type="button"
            onClick={() => handleSetView('reset')}
            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
            title="Reset Zoom & Pan"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main 3D Wireframe SVG / WebGL2 Volumetric Canvas */}
      <div
        ref={viewportHostRef}
        className={`relative w-full ${
          isMainCanvas ? 'flex-1 min-h-0' : 'h-[220px]'
        } bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 cursor-grab active:cursor-grabbing`}
      >
        {coordinateRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs gap-3 px-6 text-center cursor-default">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center">
              <Compass className="w-6 h-6 stroke-[1.5] text-cyan-400" />
            </div>
            <div className="space-y-1 max-w-md">
              <p className="text-sm font-medium text-slate-200">
                Draw pipe lines or polylines to view 3D route
              </p>
              {isMainCanvas && (
                <p className="text-xs text-slate-400">
                  Switch to 2D Document and draw lines, arrows, or closed shapes to inspect isometric piping spools or extrude 2D CAD loops.
                </p>
              )}
            </div>
            {isMainCanvas && (onReturnTo2d || onOpenExtrusionDock) && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {onReturnTo2d && (
                  <button
                    type="button"
                    data-testid="3d-canvas-return-to-2d-btn"
                    onClick={onReturnTo2d}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Draw Route in 2D</span>
                  </button>
                )}
                {onOpenExtrusionDock && (
                  <button
                    type="button"
                    data-testid="3d-canvas-open-extrusion-btn"
                    onClick={onOpenExtrusionDock}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>
                      {harvestedLoopCount > 0
                        ? `Open 3D Extrusion (${harvestedLoopCount} ${harvestedLoopCount === 1 ? 'loop' : 'loops'})`
                        : 'Open 3D Extrusion Dock'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : pipingRenderMode === 'volumetric' ? (
          <canvas
            ref={volumetricCanvasRef}
            data-testid="piping-volumetric-canvas"
            width={viewWidth}
            height={viewHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full block cursor-grab active:cursor-grabbing"
          />
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full"
          >
            {/* 3D Pipe Centerline Segments */}
            {pipeSegments.map((seg, idx) => {
              const isHighlighted =
                selectedNode === seg.p1.node.nodeNumber ||
                selectedNode === seg.p2.node.nodeNumber;
              return (
                <g key={`pipe-seg-${idx}`}>
                  {/* Outer glow for selected segment */}
                  {isHighlighted && (
                    <line
                      x1={seg.p1.screenX}
                      y1={seg.p1.screenY}
                      x2={seg.p2.screenX}
                      y2={seg.p2.screenY}
                      stroke="#06b6d4"
                      strokeWidth={6}
                      strokeOpacity={0.4}
                      strokeLinecap="round"
                    />
                  )}
                  {/* Pipe Centerline */}
                  <line
                    x1={seg.p1.screenX}
                    y1={seg.p1.screenY}
                    x2={seg.p2.screenX}
                    y2={seg.p2.screenY}
                    stroke={isHighlighted ? '#22d3ee' : '#38bdf8'}
                    strokeWidth={isHighlighted ? 3 : 2}
                    strokeLinecap="round"
                  />
                  {/* Cut length tag at segment midpoint */}
                  {typeof seg.lengthMm === 'number' && seg.lengthMm > 0 && (
                    <text
                      x={(seg.p1.screenX + seg.p2.screenX) / 2}
                      y={(seg.p1.screenY + seg.p2.screenY) / 2 - 4}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight="600"
                      fill="#94a3b8"
                      className="pointer-events-none select-none font-mono"
                    >
                      {seg.lengthMm}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 3D Nodes and Restraint / Valve Glyphs */}
            {projectedNodes.map((p) => {
              const isSelected = selectedNode === p.node.nodeNumber;
              const isHovered = hoveredNode === p.node.nodeNumber;
              const restraint = restraintMap.get(p.node.nodeNumber);
              const weight = weightMap.get(p.node.nodeNumber);

              return (
                <g
                  key={`node-${p.node.nodeNumber}`}
                  transform={`translate(${p.screenX}, ${p.screenY})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode?.(p.node.nodeNumber);
                  }}
                  onMouseEnter={() => setHoveredNode(p.node.nodeNumber)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="cursor-pointer"
                >
                  {/* Restraint Glyphs */}
                  {restraint && (
                    <g className="text-emerald-400">
                      {restraint.restraintType === 'ANC' ? (
                        // Anchor box with X
                        <g>
                          <rect x={-6} y={-6} width={12} height={12} fill="none" stroke="#10b981" strokeWidth={1.5} />
                          <line x1={-6} y1={-6} x2={6} y2={6} stroke="#10b981" strokeWidth={1} />
                          <line x1={-6} y1={6} x2={6} y2={-6} stroke="#10b981" strokeWidth={1} />
                        </g>
                      ) : restraint.restraintType === '+Y' ? (
                        // +Y Support triangle shoe
                        <polygon points="0,-2 -5,8 5,8" fill="#10b981" opacity={0.8} />
                      ) : (
                        // Guide / Stop brackets
                        <circle r={8} fill="none" stroke="#10b981" strokeWidth={1.2} strokeDasharray="2,2" />
                      )}
                    </g>
                  )}

                  {/* Valve Glyph (bowtie) */}
                  {weight && (
                    <polygon
                      points="-8,-5 -8,5 8,-5 8,5"
                      fill="#a855f7"
                      stroke="#c084fc"
                      strokeWidth={1}
                      opacity={0.85}
                    />
                  )}

                  {/* Node Circle & Selection Target Rings */}
                  {isSelected && (
                    <>
                      <circle
                        r={13}
                        className="animate-ping"
                        stroke="#06b6d4"
                        strokeWidth={1.5}
                        fill="none"
                        opacity={0.8}
                      />
                      <circle
                        r={8.5}
                        stroke="#22d3ee"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                        fill="none"
                      />
                    </>
                  )}
                  <circle
                    r={isSelected || isHovered ? 5.5 : 3.5}
                    fill={isSelected ? '#06b6d4' : isHovered ? '#38bdf8' : '#ffffff'}
                    stroke={isSelected ? '#ffffff' : '#0f172a'}
                    strokeWidth={1.5}
                  />

                  {/* Node Number Label */}
                  <text
                    x={0}
                    y={-7}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight={isSelected ? 'bold' : '600'}
                    fill={isSelected ? '#38bdf8' : '#e2e8f0'}
                    className="select-none font-mono"
                    stroke="#020617"
                    strokeWidth={0.6}
                  >
                    {p.node.nodeNumber}
                  </text>
                </g>
              );
            })}

            {/* Bottom-Left 3D Orientation Triad Compass */}
            <g className="pointer-events-none select-none">
              {/* Origin Circle */}
              <circle cx={triad.origin.x} cy={triad.origin.y} r={2} fill="#64748b" />

              {/* X Axis (East, Red) */}
              <line
                x1={triad.origin.x}
                y1={triad.origin.y}
                x2={triad.xEnd.x}
                y2={triad.xEnd.y}
                stroke="#ef4444"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              <text
                x={triad.xEnd.x + 3}
                y={triad.xEnd.y + 3}
                fontSize={8}
                fontWeight="bold"
                fill="#ef4444"
              >
                E
              </text>

              {/* Y Axis (North, Green) */}
              <line
                x1={triad.origin.x}
                y1={triad.origin.y}
                x2={triad.yEnd.x}
                y2={triad.yEnd.y}
                stroke="#22c55e"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              <text
                x={triad.yEnd.x + 3}
                y={triad.yEnd.y + 3}
                fontSize={8}
                fontWeight="bold"
                fill="#22c55e"
              >
                N
              </text>

              {/* Z Axis (Up / Elevation, Blue) */}
              <line
                x1={triad.origin.x}
                y1={triad.origin.y}
                x2={triad.zEnd.x}
                y2={triad.zEnd.y}
                stroke="#38bdf8"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
              <text
                x={triad.zEnd.x}
                y={triad.zEnd.y - 3}
                textAnchor="middle"
                fontSize={8}
                fontWeight="bold"
                fill="#38bdf8"
              >
                EL
              </text>
            </g>
          </svg>
        )}
      </div>

      {/* Volumetric Spatial Clash & Clearance Audit Strip */}
      {pipingRenderMode === 'volumetric' && volumetricScene && localClashReport && (
        <div
          data-testid="piping-clash-summary"
          className="px-2.5 py-1.5 bg-slate-950/90 border-t border-slate-800/80 text-[10px] space-y-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono">
              {localClashReport.hardClashCount > 0 ? (
                <span className="flex items-center gap-1 text-red-400 font-semibold">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{localClashReport.hardClashCount} Hard Clash</span>
                </span>
              ) : localClashReport.clearanceViolationCount > 0 ? (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{localClashReport.clearanceViolationCount} Clearance Warn</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Clear ({localClashReport.totalObjectsChecked} solids)</span>
                </span>
              )}
              <span className="text-slate-400">
                Elbows: {volumetricScene.elbowCount} · Hollow: {volumetricScene.hollowSegmentCount}
              </span>
            </div>

            <label className="flex items-center gap-1 text-slate-400 font-mono">
              <span>Min Clear:</span>
              <input
                type="number"
                min={0}
                max={500}
                data-testid="piping-clash-clearance-input"
                value={clashMinClearanceMm}
                onChange={(e) => setClashMinClearanceMm(Number(e.target.value))}
                className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-right text-slate-200"
              />
              <span>mm</span>
            </label>
          </div>

          {localClashReport.clashes.length > 0 && (
            <div className="max-h-20 overflow-auto space-y-0.5">
              {localClashReport.clashes.slice(0, 4).map((issue, idx) => (
                <button
                  key={issue.id}
                  type="button"
                  data-testid={`piping-clash-item-${idx}`}
                  onClick={() =>
                    setSelectedClashId(selectedClashId === issue.id ? null : issue.id)
                  }
                  className={`w-full text-left px-1.5 py-0.5 rounded flex items-center justify-between gap-2 font-mono transition-colors ${
                    selectedClashId === issue.id
                      ? 'bg-yellow-500/20 border border-yellow-400/60 text-yellow-200'
                      : issue.severity === 'HARD_CLASH'
                        ? 'bg-red-950/60 text-red-200 hover:bg-red-900/60'
                        : 'bg-amber-950/60 text-amber-200 hover:bg-amber-900/60'
                  }`}
                >
                  <span className="truncate">
                    {issue.partALabel} ↔ {issue.partBLabel}
                  </span>
                  <span className="shrink-0">
                    {issue.severity === 'HARD_CLASH'
                      ? `-${issue.penetrationDepthMm}mm`
                      : `${issue.surfaceClearanceMm}mm gap`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Node Telemetry & Coordinate Footer */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-slate-950/80 border-t border-slate-800/80 text-[10px] text-slate-300 font-mono">
        {activeNodeData ? (
          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-cyan-400">Node {activeNodeData.nodeNumber}:</span>
            <span>X: {activeNodeData.x.toLocaleString()} mm</span>
            <span>Y: {activeNodeData.y.toLocaleString()} mm</span>
            <span className="text-emerald-400 font-semibold">EL (Z): {activeNodeData.z.toLocaleString()} mm</span>
          </div>
        ) : (
          <div className="text-slate-500 italic">
            Drag to orbit 3D view • Scroll to zoom • Click node to inspect
          </div>
        )}
      </div>
    </div>
  );
};
