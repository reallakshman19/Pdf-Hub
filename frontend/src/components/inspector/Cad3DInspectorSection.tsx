import React, { useMemo, useState } from 'react';
import {
  Box,
  Download,
  Eye,
  FileBox,
  Layers,
  Palette,
  Search,
  Sliders,
} from 'lucide-react';
import { useCadModelingStore } from '../../core/cad-modeling/store';
import { useSessionStore } from '../../core/session/store';
import { extrudeClosedLoopTo3D } from '../../core/cad-3d/extrudeEngine';
import { serializeMeshToObj } from '../../core/cad-3d/objExport';
import { serializeMeshToGltf } from '../../core/cad-3d/gltfExport';
import { embedU3DMeshInPdf, extractPdf3DAnnotations } from '../../core/cad-3d/pdf3dAnnotation';

export interface Cad3DInspectorSectionProps {
  className?: string;
}

const SHADED_COLOR_PRESETS = [
  { name: 'Steel Blue', color: '#3b82f6' },
  { name: 'Matte Slate', color: '#334155' },
  { name: 'Brass', color: '#d97706' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Rose', color: '#e11d48' },
];

const WIREFRAME_COLOR_PRESETS = [
  { name: 'Cyan', color: '#00ffff' },
  { name: 'Neon Green', color: '#22c55e' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'White', color: '#ffffff' },
];

export const Cad3DInspectorSection: React.FC<Cad3DInspectorSectionProps> = ({
  className = '',
}) => {
  const {
    dock3d,
    harvestedLoops,
    pdf3dAnnotations,
    activeLoadedU3DMesh,
    setExtrudeDepth,
    setBevelSize,
    setViewMode,
    setShadedColor,
    setWireframeColor,
    set3DDockOpen,
    setSelectedLoop,
    setPdf3dAnnotations,
    setActiveLoadedU3DMesh,
  } = useCadModelingStore();
  const workingBytes = useSessionStore((s) => s.workingBytes);
  const [pdf3dStatus, setPdf3dStatus] = useState<string | null>(null);
  const [pdf3dBusy, setPdf3dBusy] = useState(false);

  const selectedLoop = useMemo(() => {
    if (harvestedLoops.length === 0) return null;
    return (
      harvestedLoops.find((l) => l.id === dock3d.selectedLoopId) ??
      harvestedLoops[0]
    );
  }, [harvestedLoops, dock3d.selectedLoopId]);

  const mesh3d = useMemo(() => {
    if (activeLoadedU3DMesh) return activeLoadedU3DMesh;
    if (!selectedLoop) return null;
    return extrudeClosedLoopTo3D(selectedLoop, {
      depth: dock3d.extrudeDepth,
      bevelSize: dock3d.bevelSize,
    });
  }, [activeLoadedU3DMesh, selectedLoop, dock3d.extrudeDepth, dock3d.bevelSize]);

  const handleDownloadFile = (
    filename: string,
    content: string | Uint8Array,
    mimeType: string,
  ) => {
    if (typeof document === 'undefined') return;
    const blobPart: BlobPart =
      typeof content === 'string' ? content : new Uint8Array(content);
    const blob = new Blob([blobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportObj = () => {
    if (!mesh3d) return;
    const objText = serializeMeshToObj(mesh3d, `Part_${selectedLoop?.id ?? mesh3d.id}`);
    handleDownloadFile(`part_${selectedLoop?.id ?? mesh3d.id}.obj`, objText, 'text/plain');
  };

  const handleExportGltf = () => {
    if (!mesh3d) return;
    const gltfText = serializeMeshToGltf(mesh3d, `Part_${selectedLoop?.id ?? mesh3d.id}`);
    handleDownloadFile(`part_${selectedLoop?.id ?? mesh3d.id}.gltf`, gltfText, 'model/gltf+json');
  };

  const handleExport3DPdf = async () => {
    if (!mesh3d) return;
    setPdf3dBusy(true);
    setPdf3dStatus(null);
    try {
      const res = await embedU3DMeshInPdf(workingBytes ?? null, [mesh3d], {
        annotationName: `DocCraft_${mesh3d.id}`,
        compressStream: true,
      });
      handleDownloadFile(`part_${mesh3d.id}_3d.pdf`, res.pdfBytes, 'application/pdf');
      setPdf3dStatus(`Embedded U3D (${res.u3dByteLength} B)`);
    } catch (err) {
      setPdf3dStatus(err instanceof Error ? err.message : '3D PDF export failed.');
    } finally {
      setPdf3dBusy(false);
    }
  };

  const handleScanPdf3D = async () => {
    if (!workingBytes) {
      setPdf3dStatus('Open a PDF document first to scan /Subtype /3D streams.');
      return;
    }
    setPdf3dBusy(true);
    setPdf3dStatus(null);
    try {
      const res = await extractPdf3DAnnotations(workingBytes);
      setPdf3dAnnotations(res.annotations);
      setPdf3dStatus(
        res.annotationCount > 0
          ? `Found ${res.annotationCount} native 3D stream(s)`
          : 'No /Subtype /3D annotations present in active PDF.',
      );
    } catch (err) {
      setPdf3dStatus(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setPdf3dBusy(false);
    }
  };

  return (
    <div
      data-testid="cad-3d-inspector-section"
      className={`space-y-4 p-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <Box className="w-4 h-4 text-cyan-400" />
          <span>3D Extrusion & Modeling</span>
        </div>
        <button
          type="button"
          data-testid="inspector-btn-toggle-viewport"
          onClick={() => set3DDockOpen(!dock3d.isOpen)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            dock3d.isOpen
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {dock3d.isOpen ? 'Dock Active' : 'Open 3D Dock'}
        </button>
      </div>

      {/* Target Loop Selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>Target 2D Profile:</span>
        </label>
        {harvestedLoops.length > 0 ? (
          <select
            data-testid="inspector-loop-select"
            value={dock3d.selectedLoopId ?? ''}
            onChange={(e) => setSelectedLoop(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          >
            {harvestedLoops.map((l, i) => (
              <option key={l.id} value={l.id}>
                Loop #{i + 1} ({Math.round(l.area)} pt², {l.vertices.length} vertices)
              </option>
            ))}
          </select>
        ) : (
          <p className="text-slate-500 italic text-[11px]">
            No harvested 2D closed loops found on active page.
          </p>
        )}
      </div>

      {/* Extrude Depth Slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-400 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Extrusion Depth (pt):</span>
          </span>
          <span className="font-mono text-cyan-300 font-semibold">{dock3d.extrudeDepth} pt</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            data-testid="inspector-depth-slider"
            min="1"
            max="200"
            step="1"
            value={dock3d.extrudeDepth}
            onChange={(e) => setExtrudeDepth(Number(e.target.value))}
            className="flex-1 accent-cyan-500"
          />
          <input
            type="number"
            data-testid="inspector-depth-input"
            min="1"
            max="1000"
            value={dock3d.extrudeDepth}
            onChange={(e) => setExtrudeDepth(Number(e.target.value))}
            className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-100"
          />
        </div>
      </div>

      {/* Bevel Size Slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-400">Bevel Offset:</span>
          <span className="font-mono text-cyan-300 font-semibold">{dock3d.bevelSize} pt</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            data-testid="inspector-bevel-slider"
            min="0"
            max="20"
            step="0.5"
            value={dock3d.bevelSize}
            onChange={(e) => setBevelSize(Number(e.target.value))}
            className="flex-1 accent-cyan-500"
          />
          <input
            type="number"
            data-testid="inspector-bevel-input"
            min="0"
            max="50"
            step="0.5"
            value={dock3d.bevelSize}
            onChange={(e) => setBevelSize(Number(e.target.value))}
            className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-100"
          />
        </div>
      </div>

      {/* Shaded Material Color Swatches */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
          <Palette className="w-3.5 h-3.5 text-slate-400" />
          <span>Material Palette:</span>
        </label>
        <div className="flex items-center gap-2">
          {SHADED_COLOR_PRESETS.map((p) => (
            <button
              key={p.color}
              type="button"
              data-testid={`preset-color-${p.color}`}
              title={p.name}
              onClick={() => setShadedColor(p.color)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                dock3d.shadedColor.toLowerCase() === p.color.toLowerCase()
                  ? 'border-white scale-110 shadow-sm'
                  : 'border-slate-700 hover:scale-105'
              }`}
              style={{ backgroundColor: p.color }}
            />
          ))}
          <input
            type="color"
            value={dock3d.shadedColor}
            onChange={(e) => setShadedColor(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            title="Custom Color"
          />
        </div>
      </div>

      {/* Wireframe Color Swatches */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400">Wireframe Accent:</label>
        <div className="flex items-center gap-2">
          {WIREFRAME_COLOR_PRESETS.map((p) => (
            <button
              key={p.color}
              type="button"
              data-testid={`preset-wire-${p.color}`}
              title={p.name}
              onClick={() => setWireframeColor(p.color)}
              className={`w-5 h-5 rounded border-2 transition-transform ${
                dock3d.wireframeColor.toLowerCase() === p.color.toLowerCase()
                  ? 'border-white scale-110'
                  : 'border-slate-700 hover:scale-105'
              }`}
              style={{ backgroundColor: p.color }}
            />
          ))}
        </div>
      </div>

      {/* View Mode */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span>Render Style:</span>
        </label>
        <div className="grid grid-cols-3 gap-1">
          {(['shaded', 'wireframe', 'xray'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`inspector-mode-${mode}`}
              onClick={() => setViewMode(mode)}
              className={`py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                dock3d.viewMode === mode
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Solid Telemetry Metrics */}
      {mesh3d && (
        <div
          data-testid="inspector-mesh-metrics"
          className="p-2 bg-slate-950/70 border border-slate-800 rounded font-mono text-[10px] space-y-1 text-slate-400"
        >
          <div className="flex justify-between">
            <span>Volume:</span>
            <span className="text-slate-200 font-semibold">{mesh3d.volume.toLocaleString('en-US')} pt³</span>
          </div>
          <div className="flex justify-between">
            <span>Surface Area:</span>
            <span className="text-slate-200 font-semibold">{mesh3d.surfaceArea.toLocaleString('en-US')} pt²</span>
          </div>
          <div className="flex justify-between">
            <span>Triangles:</span>
            <span className="text-slate-200 font-semibold">{mesh3d.triangleCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Dimensions:</span>
            <span className="text-slate-200">
              {(mesh3d.bounds.maxX - mesh3d.bounds.minX).toFixed(1)} ×{' '}
              {(mesh3d.bounds.maxY - mesh3d.bounds.minY).toFixed(1)} × {mesh3d.bounds.maxZ.toFixed(1)} pt
            </span>
          </div>
        </div>
      )}

      {/* Export Actions */}
      <div className="pt-2 border-t border-slate-700/60 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="inspector-btn-export-obj"
            disabled={!mesh3d}
            onClick={handleExportObj}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium disabled:opacity-40 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export OBJ</span>
          </button>

          <button
            type="button"
            data-testid="inspector-btn-export-gltf"
            disabled={!mesh3d}
            onClick={handleExportGltf}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium disabled:opacity-40 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export glTF</span>
          </button>
        </div>

        <button
          type="button"
          data-testid="inspector-btn-export-3dpdf"
          disabled={!mesh3d || pdf3dBusy}
          onClick={() => void handleExport3DPdf()}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-medium disabled:opacity-40 transition-colors"
          title="Embed solid mesh as native ECMA-363 U3D /Subtype /3D PDF annotation"
        >
          <FileBox className="w-3.5 h-3.5" />
          <span>Export Native 3D PDF (U3D)</span>
        </button>
      </div>

      {/* Native 3D PDF (U3D / PRC) Stream Scanner */}
      <div
        data-testid="inspector-pdf3d-engine"
        className="pt-2 border-t border-slate-700/60 space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
            <FileBox className="w-3.5 h-3.5 text-cyan-400" />
            <span>Native 3D PDF Streams</span>
          </span>
          <button
            type="button"
            data-testid="inspector-btn-scan-3dpdf"
            disabled={pdf3dBusy}
            onClick={() => void handleScanPdf3D()}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-medium border border-slate-700"
          >
            <Search className="w-3 h-3" />
            <span>Scan PDF</span>
          </button>
        </div>

        {pdf3dStatus && (
          <div
            data-testid="inspector-pdf3d-status"
            className="text-[10px] text-cyan-300 bg-slate-950/70 border border-slate-800 rounded px-2 py-1"
          >
            {pdf3dStatus}
          </div>
        )}

        {pdf3dAnnotations.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {pdf3dAnnotations.map((annot) => (
              <div
                key={annot.id}
                data-testid={`pdf3d-annot-${annot.id}`}
                className="p-2 rounded bg-slate-950/70 border border-slate-800 space-y-1 text-[10px]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-slate-100 truncate">{annot.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 uppercase font-mono">
                    {annot.format} · p.{annot.pageNumber}
                  </span>
                </div>
                <div className="text-slate-400 font-mono">
                  {annot.streamByteLength} B · {annot.views.length} view(s) ·{' '}
                  {annot.meshes.length > 0
                    ? `${annot.meshes.reduce((s, m) => s + m.triangleCount, 0)} tris`
                    : annot.prcDetails
                      ? `${annot.prcDetails.sections.length} PRC sec(s)`
                      : 'metadata'}
                </div>
                {annot.meshes.length > 0 && (
                  <button
                    type="button"
                    data-testid="inspector-btn-load-u3d-mesh"
                    onClick={() => {
                      setActiveLoadedU3DMesh(annot.meshes[0]);
                      set3DDockOpen(true);
                    }}
                    className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium"
                  >
                    Load U3D Mesh in 3D Dock
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
