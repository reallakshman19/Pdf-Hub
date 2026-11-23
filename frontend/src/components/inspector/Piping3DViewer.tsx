import React, { useMemo, useState, useRef, useCallback } from 'react';
import type { FullXmlBuilderModel, PipelineCoordinateRow } from '@/core/pipeline-geometry/types';
import { Rotate3d, Compass, Maximize2 } from 'lucide-react';

export interface Piping3DViewerProps {
  model: FullXmlBuilderModel;
  selectedNode?: number | null;
  onSelectNode?: (nodeNumber: number) => void;
  className?: string;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera & view state
  const [azimuth, setAzimuth] = useState<number>(DEFAULT_AZIMUTH);
  const [elevation, setElevation] = useState<number>(DEFAULT_ELEVATION);
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

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
      const screenX = width / 2 + pan.x + x1 * baseScale;
      const screenY = height / 2 + pan.y - (z1 * cosE + y1 * sinE) * baseScale;

      return { x: screenX, y: screenY, depth };
    },
    [bounds, azimuth, elevation, zoom, pan],
  );

  // Viewport dimensions (fixed or responsive)
  const viewWidth = 360;
  const viewHeight = 220;

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

  // Support lookup by nodeNumber
  const restraintMap = useMemo(() => {
    const map = new Map<number, typeof model.restraintRows[0]>();
    for (const r of model.restraintRows) {
      map.set(r.nodeNumber, r);
    }
    return map;
  }, [model.restraintRows]);

  // Valve / Weight component lookup by nodeNumber
  const weightMap = useMemo(() => {
    const map = new Map<number, typeof model.weightRows[0]>();
    for (const w of model.weightRows) {
      map.set(w.nodeNumber, w);
    }
    return map;
  }, [model.weightRows]);

  // Triad Axes projection for bottom-left orientation compass
  const triad = useMemo(() => {
    const triadLen = 28;
    const origin = { x: 38, y: viewHeight - 34 };

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
  }, [azimuth, elevation, viewHeight]);

  // Mouse drag handlers for real-time 3D rotation
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
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
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/70 border-b border-slate-800/80 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Rotate3d className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[10px]">
            3D Piping Wireframe
          </span>
          <span className="text-[9px] text-slate-400 font-mono">
            ({coordinateRows.length} nodes)
          </span>
        </div>

        {/* Camera Preset Quick Buttons */}
        <div className="flex items-center gap-1">
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

      {/* Main 3D Wireframe SVG Canvas */}
      <div className="relative w-full h-[220px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 cursor-grab active:cursor-grabbing">
        {coordinateRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-1">
            <Compass className="w-6 h-6 stroke-1 text-slate-600" />
            <span>Draw pipe lines or polylines to view 3D route</span>
          </div>
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

                  {/* Node Circle */}
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
