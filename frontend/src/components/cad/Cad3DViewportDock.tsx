import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
} from 'lucide-react';
import { useCadModelingStore } from '../../core/cad-modeling/store';
import { extrudeClosedLoopTo3D } from '../../core/cad-3d/extrudeEngine';
import {
  type Camera3D,
  DEFAULT_CAMERA_3D,
  renderSceneMeshesToCanvas2D,
} from '../../core/cad-3d/software3dRenderer';
import { WebGl3DRenderer } from '../../core/cad-3d/webgl3dRenderer';
import { WebGlDisposalManager } from '../../core/cad-3d/webglDisposal';

export interface Cad3DViewportDockProps {
  className?: string;
  width?: number;
  height?: number;
}

export const Cad3DViewportDock: React.FC<Cad3DViewportDockProps> = ({
  className = '',
  width = 380,
  height = 320,
}) => {
  const {
    dock3d,
    harvestedLoops,
    activeLoadedU3DMesh,
    set3DDockOpen,
    setSelectedLoop,
    setViewMode,
    setActiveLoadedU3DMesh,
  } = useCadModelingStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const disposalManagerRef = useRef<WebGlDisposalManager | null>(null);
  const webglRendererRef = useRef<WebGl3DRenderer | null>(null);
  const webglAttemptedRef = useRef(false);

  const [camera, setCamera] = useState<Camera3D>({ ...DEFAULT_CAMERA_3D });
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'orbit' | 'pan'>('orbit');
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Active selected closed loop
  const selectedLoop = useMemo(() => {
    if (harvestedLoops.length === 0) return null;
    return (
      harvestedLoops.find((l) => l.id === dock3d.selectedLoopId) ??
      harvestedLoops[0]
    );
  }, [harvestedLoops, dock3d.selectedLoopId]);

  // Compute 3D Mesh (prefer explicitly loaded U3D mesh if active, otherwise extrude selected 2D loop)
  const mesh3d = useMemo(() => {
    if (activeLoadedU3DMesh) return activeLoadedU3DMesh;
    if (!selectedLoop) return null;
    return extrudeClosedLoopTo3D(selectedLoop, { depth: dock3d.extrudeDepth });
  }, [activeLoadedU3DMesh, selectedLoop, dock3d.extrudeDepth]);

  // Active WebGL VRAM Disposal on unmount
  useEffect(() => {
    const manager = new WebGlDisposalManager();
    disposalManagerRef.current = manager;

    return () => {
      webglRendererRef.current?.dispose();
      webglRendererRef.current = null;
      webglAttemptedRef.current = false;
      boundCanvasRef.current = null;
      manager.dispose();
      disposalManagerRef.current = null;
    };
  }, []);

  // Render loop (WebGL2 hardware accelerated with Canvas2D fallback)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!dock3d.isOpen || !canvas || !mesh3d) {
      if (!dock3d.isOpen && webglRendererRef.current) {
        webglRendererRef.current.dispose();
        webglRendererRef.current = null;
        webglAttemptedRef.current = false;
        boundCanvasRef.current = null;
      }
      return;
    }

    if (boundCanvasRef.current !== canvas) {
      webglRendererRef.current?.dispose();
      webglRendererRef.current = null;
      webglAttemptedRef.current = false;
      boundCanvasRef.current = canvas;
    }

    const span = Math.max(
      20,
      mesh3d.bounds.maxX - mesh3d.bounds.minX,
      mesh3d.bounds.maxY - mesh3d.bounds.minY,
      mesh3d.bounds.maxZ - mesh3d.bounds.minZ,
    );
    const effectiveCam: Camera3D =
      camera.distance === DEFAULT_CAMERA_3D.distance
        ? { ...camera, distance: Math.max(DEFAULT_CAMERA_3D.distance, span * 2.0) }
        : camera;

    const sceneItems = [
      {
        id: mesh3d.id,
        mesh: mesh3d,
        color: dock3d.shadedColor,
      },
    ];
    const renderOptions = {
      viewMode: dock3d.viewMode,
      shadedColor: dock3d.shadedColor,
      wireframeColor: dock3d.wireframeColor,
      drawGroundGrid: true,
      pivotCenter: mesh3d.centroid,
    };

    if (!webglAttemptedRef.current) {
      webglAttemptedRef.current = true;
      webglRendererRef.current = WebGl3DRenderer.tryCreate(
        canvas,
        disposalManagerRef.current ?? undefined,
      );
    }

    if (webglRendererRef.current) {
      webglRendererRef.current.renderScene(sceneItems, effectiveCam, renderOptions);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderSceneMeshesToCanvas2D(ctx, sceneItems, effectiveCam, renderOptions);
  }, [
    dock3d.isOpen,
    isExpanded,
    mesh3d,
    camera,
    dock3d.viewMode,
    dock3d.shadedColor,
    dock3d.wireframeColor,
  ]);

  if (!dock3d.isOpen) return null;

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setDragMode(e.shiftKey || e.button === 1 || e.button === 2 ? 'pan' : 'orbit');
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !lastMousePos) return;

    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    setLastMousePos({ x: e.clientX, y: e.clientY });

    if (dragMode === 'orbit') {
      setCamera((prev) => ({
        ...prev,
        azimuthDeg: (prev.azimuthDeg + dx * 0.8) % 360,
        elevationDeg: Math.max(-85, Math.min(85, prev.elevationDeg - dy * 0.8)),
      }));
    } else {
      setCamera((prev) => ({
        ...prev,
        panOffset: {
          x: prev.panOffset.x + dx,
          y: prev.panOffset.y + dy,
        },
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastMousePos(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    setCamera((prev) => ({
      ...prev,
      distance: Math.max(50, Math.min(2500, prev.distance * zoomFactor)),
    }));
  };

  const handleResetCamera = () => {
    setCamera({ ...DEFAULT_CAMERA_3D });
  };

  const effectiveWidth = isExpanded ? 560 : width;
  const effectiveHeight = isExpanded ? 460 : height;

  return (
    <div
      data-testid="cad-3d-viewport-dock"
      className={`fixed top-16 right-4 z-40 flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md text-slate-200 select-none font-sans overflow-hidden transition-all ${className}`}
      style={{ width: effectiveWidth }}
    >
      {/* Title Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700/80 text-xs">
        <div className="flex items-center gap-2 font-semibold text-slate-100">
          <Box className="w-4 h-4 text-cyan-400" />
          <span>3D Extrusion Viewport</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Reset Camera */}
          <button
            type="button"
            data-testid="dock-btn-reset-camera"
            title="Reset Camera View"
            onClick={handleResetCamera}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Expand / Collapse */}
          <button
            type="button"
            data-testid="dock-btn-expand"
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors"
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close */}
          <button
            type="button"
            data-testid="dock-btn-close"
            title="Close 3D Viewport"
            onClick={() => set3DDockOpen(false)}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/60 text-[11px]">
        {/* Loop / Loaded U3D Mesh Selector */}
        <div className="flex items-center gap-1.5">
          {activeLoadedU3DMesh ? (
            <div className="flex items-center gap-1.5">
              <span
                data-testid="dock-u3d-badge"
                className="px-1.5 py-0.5 rounded bg-cyan-900/60 border border-cyan-600/50 text-cyan-200 text-[10px] font-mono truncate max-w-[110px]"
                title={activeLoadedU3DMesh.id}
              >
                U3D: {activeLoadedU3DMesh.id}
              </span>
              <button
                type="button"
                data-testid="dock-btn-clear-u3d"
                onClick={() => setActiveLoadedU3DMesh(null)}
                className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px]"
              >
                Exit U3D
              </button>
            </div>
          ) : (
            <>
              <span className="text-slate-400">Loop:</span>
              {harvestedLoops.length > 0 ? (
                <select
                  data-testid="dock-loop-select"
                  value={dock3d.selectedLoopId ?? ''}
                  onChange={(e) => setSelectedLoop(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500"
                >
                  {harvestedLoops.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      Loop #{i + 1} ({Math.round(l.area)} pt²)
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-500 italic">No loops detected</span>
              )}
            </>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="dock-mode-shaded"
            onClick={() => setViewMode('shaded')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              dock3d.viewMode === 'shaded'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            Shaded
          </button>
          <button
            type="button"
            data-testid="dock-mode-wireframe"
            onClick={() => setViewMode('wireframe')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              dock3d.viewMode === 'wireframe'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            Wireframe
          </button>
          <button
            type="button"
            data-testid="dock-mode-xray"
            onClick={() => setViewMode('xray')}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              dock3d.viewMode === 'xray'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-700'
            }`}
          >
            X-Ray
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative bg-slate-950 flex items-center justify-center">
        {mesh3d ? (
          <canvas
            ref={canvasRef}
            data-testid="dock-3d-canvas"
            width={effectiveWidth}
            height={effectiveHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="cursor-grab active:cursor-grabbing block"
          />
        ) : (
          <div
            data-testid="dock-empty-state"
            className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 text-xs"
            style={{ height: effectiveHeight }}
          >
            <Layers className="w-8 h-8 text-slate-600 stroke-[1.5]" />
            <p>Select or harvest a 2D closed loop to extrude in 3D.</p>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      {mesh3d && (
        <div
          data-testid="dock-footer-telemetry"
          className="flex items-center justify-between px-3 py-1 bg-slate-800/90 border-t border-slate-700/80 text-[10px] font-mono text-slate-400"
        >
          <span>Tris: {mesh3d.triangleCount}</span>
          <span>Vol: {mesh3d.volume.toLocaleString('en-US')} pt³</span>
          <span>Depth: {dock3d.extrudeDepth} pt</span>
        </div>
      )}
    </div>
  );
};
