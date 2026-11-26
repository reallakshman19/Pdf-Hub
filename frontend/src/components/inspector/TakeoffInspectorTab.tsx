import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useCalloutStore } from '@/core/callout/store';
import { usePipingTableStore } from '@/core/pipeline-geometry/table-store/pipingTableStore';
import { useCadModelingStore } from '@/core/cad-modeling/store';
import { portPdfPageVectorsToAnnotations, type VectorPortTargetMode } from '@/adapters/pdf-renderer/pdfVectorToCanvasService';
import { PipingTableGrid } from './PipingTableGrid';
import {
  computeTakeoffSummary,
  generateTakeoffCsv,
} from '@/core/annotations/takeoffExport';
import {
  serializeXmlBuilderTablesToTsv,
  createXmlBuilderLaunchUrl,
} from '@/core/pipeline-geometry/pipelineModelAggregator';
import { buildDirectCaesarXmlFromTables } from '@/core/pipeline-geometry/caesar-engine/customInputXmlWriter';
import { Button } from '@/components/ui/Button';
import {
  Download,
  Ruler,
  Copy,
  Check,
  Code2,
  TableProperties,
  ExternalLink,
  FileCode,
  Rotate3d,
  ScanLine,
  Crop,
  Layers,
  Waypoints,
  ScanText,
  Wand2,
} from 'lucide-react';
import { ScaleCalibrationDialog } from '@/components/dialogs/ScaleCalibrationDialog';
import { Piping3DViewer } from './Piping3DViewer';
import { Cad3DInspectorSection } from './Cad3DInspectorSection';
import type { PipelineRoutingMode } from '@/core/pipeline-geometry/types';
import type { TableKind } from '@/core/pipeline-geometry/table-store/types';

export const TakeoffInspectorTab: React.FC = () => {
  const [scope, setScope] = useState<'all' | 'page'>('page');
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const activeTableTab = usePipingTableStore((state) => state.activeTableTab);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [startNode] = useState(100);
  const {
    pipingBranchName: branchName,
    pipingElevationZ: elevationZ,
    pipingRoutingMode: routingMode,
    setPipingBranchName: setBranchName,
    setPipingElevationZ: setElevationZ,
    setPipingRoutingMode: setRoutingMode,
    vectorRoiCapture,
    vectorRoiStatus,
    vectorLayersDetected,
    startVectorRoiCapture,
    cancelVectorRoiCapture,
    setVectorRoiStatus,
    setVectorLayersDetected,
    rasterTraceStatus,
    setRasterTraceStatus,
    lastRasterRegionRect,
    setLastRasterRegionRect,
    rasterThresholdMethod,
    setRasterThresholdMethod,
    rasterRdpEpsilonPx,
    setRasterRdpEpsilonPx,
    rasterMinLengthPx,
    setRasterMinLengthPx,
  } = useCadModelingStore(
    useShallow((state) => ({
      pipingBranchName: state.pipingBranchName,
      pipingElevationZ: state.pipingElevationZ,
      pipingRoutingMode: state.pipingRoutingMode,
      setPipingBranchName: state.setPipingBranchName,
      setPipingElevationZ: state.setPipingElevationZ,
      setPipingRoutingMode: state.setPipingRoutingMode,
      vectorRoiCapture: state.vectorRoiCapture,
      vectorRoiStatus: state.vectorRoiStatus,
      vectorLayersDetected: state.vectorLayersDetected,
      startVectorRoiCapture: state.startVectorRoiCapture,
      cancelVectorRoiCapture: state.cancelVectorRoiCapture,
      setVectorRoiStatus: state.setVectorRoiStatus,
      setVectorLayersDetected: state.setVectorLayersDetected,
      rasterTraceStatus: state.rasterTraceStatus,
      setRasterTraceStatus: state.setRasterTraceStatus,
      lastRasterRegionRect: state.lastRasterRegionRect,
      setLastRasterRegionRect: state.setLastRasterRegionRect,
      rasterThresholdMethod: state.rasterThresholdMethod,
      setRasterThresholdMethod: state.setRasterThresholdMethod,
      rasterRdpEpsilonPx: state.rasterRdpEpsilonPx,
      setRasterRdpEpsilonPx: state.setRasterRdpEpsilonPx,
      rasterMinLengthPx: state.rasterMinLengthPx,
      setRasterMinLengthPx: state.setRasterMinLengthPx,
    })),
  );
  const [portMode, setPortMode] = useState<VectorPortTargetMode>('pipe');
  const [portIncludeLabels, setPortIncludeLabels] = useState(true);
  const [portAttachBranchTags, setPortAttachBranchTags] = useState(true);
  const [portSelectedLayer, setPortSelectedLayer] = useState('');
  const [portBusy, setPortBusy] = useState(false);
  const pdfDoc = usePdfStore((state) => state.pdfDoc);
  const pageGraph = useSessionStore((state) => state.pageGraph);
  const { selectedNode, setSelectedNode } = usePipingTableStore(
    useShallow((state) => ({
      selectedNode: state.selectedNodeNumber,
      setSelectedNode: state.setSelectedNodeNumber,
    })),
  );
  const [show3DViewer] = useState<boolean>(true);

  const currentPage = useSessionStore((state) => state.viewState.currentPage);
  const totalPages = useSessionStore((state) => state.pageCount || 1);

  const { workspaceViewMode, setWorkspaceViewMode, setActiveTool } = useEditorStore(
    useShallow((state) => ({
      workspaceViewMode: state.workspaceViewMode ?? '2d',
      setWorkspaceViewMode: state.setWorkspaceViewMode,
      setActiveTool: state.setActiveTool,
    })),
  );
  const setCalloutActiveTool = useCalloutStore((state) => state.setActiveTool);

  const {
    annotations,
    getPageCalibration,
    setPageCalibration,
    setAllPagesCalibration,
    addAnnotation,
    addManyAnnotations,
    updateAnnotation,
  } = useAnnotationStore(
    useShallow((state) => ({
      annotations: state.annotations,
      getPageCalibration: state.getPageCalibration,
      setPageCalibration: state.setPageCalibration,
      setAllPagesCalibration: state.setAllPagesCalibration,
      addAnnotation: state.addAnnotation,
      addManyAnnotations: state.addManyAnnotations,
      updateAnnotation: state.updateAnnotation,
    })),
  );

  const currentCalibration = getPageCalibration(currentPage);

  const filteredAnnotations = useMemo(() => {
    if (scope === 'page') {
      return annotations.filter((a) => a.pageNumber === currentPage);
    }
    return annotations;
  }, [annotations, scope, currentPage]);

  const summary = useMemo(() => {
    return computeTakeoffSummary(filteredAnnotations, getPageCalibration);
  }, [filteredAnnotations, getPageCalibration]);

  const {
    coordinateRows,
    branchRows,
    restraintRows,
    weightRows,
    dtxrRows,
    syncFromAnnotations,
    computeAnnotationPatches,
    clearDirtyCells,
    getFullModel,
  } = usePipingTableStore();

  useEffect(() => {
    syncFromAnnotations(
      filteredAnnotations,
      getPageCalibration,
      {
        branchName,
        startNodeNumber: startNode,
        defaultElevationZ: elevationZ,
        routingMode,
      },
      currentPage,
    );
  }, [
    filteredAnnotations,
    getPageCalibration,
    branchName,
    startNode,
    elevationZ,
    routingMode,
    currentPage,
    syncFromAnnotations,
  ]);

  const fullModel = getFullModel();
  void [coordinateRows, branchRows, restraintRows, weightRows, dtxrRows];

  const handleApplyTableToSheet = () => {
    const patches = computeAnnotationPatches(annotations, getPageCalibration);
    patches.forEach(({ id, patch }) => {
      updateAnnotation(id, patch);
    });
    clearDirtyCells();
  };

  const handleResetFromSheet = () => {
    clearDirtyCells();
    syncFromAnnotations(
      filteredAnnotations,
      getPageCalibration,
      {
        branchName,
        startNodeNumber: startNode,
        defaultElevationZ: elevationZ,
        routingMode,
      },
      currentPage,
    );
  };

  const tsvTables = useMemo(() => {
    return serializeXmlBuilderTablesToTsv(fullModel);
  }, [fullModel]);

  const handleCopyTableTsv = async (tab: TableKind) => {
    let tsv = '';
    if (tab === 'coordinates') tsv = tsvTables.coordinateRows;
    else if (tab === 'branches') tsv = tsvTables.branchRows;
    else if (tab === 'restraints') tsv = tsvTables.restraintRows;
    else if (tab === 'weights') tsv = tsvTables.weightRows;
    else if (tab === 'dtxr') tsv = tsvTables.dtxrRows;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsv);
      }
      setCopiedKey(tab);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadCaesarXml = () => {
    const xml = buildDirectCaesarXmlFromTables(fullModel, { autoBend: true, autoTee: true });
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `caesar_ii_model_${scope === 'page' ? `page_${currentPage}` : 'all'}.xml`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLaunchXmlBuilder = () => {
    const launchUrl = createXmlBuilderLaunchUrl(fullModel);
    window.open(launchUrl, '_blank', 'noopener,noreferrer');
  };

  const handleExportCsv = () => {
    const csvContent = generateTakeoffCsv(summary);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `takeoff_summary_${scope === 'page' ? `page_${currentPage}` : 'all_pages'}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleStampScheduleToSheet = () => {
    const tableId = `takeoff-table-${Date.now()}`;
    const scheduleHeader = 'QUANTITY TAKEOFF / BILL OF MATERIALS';
    const lines = [
      scheduleHeader,
      '------------------------------------------------',
      'ITEM / TYPE               QTY   LENGTH    AREA',
      '------------------------------------------------',
    ];
    for (const g of summary.groups) {
      const typeStr = (g.label || g.type).padEnd(24).slice(0, 24);
      const qtyStr = String(g.count).padStart(4);
      const lenStr = (g.totalLengthReal > 0 ? `${g.totalLengthReal.toFixed(1)} ${g.unit}` : '-').padStart(9);
      const areaStr = (g.totalAreaReal > 0 ? `${g.totalAreaReal.toFixed(1)} ${g.unit}²` : '-').padStart(9);
      lines.push(`${typeStr} ${qtyStr} ${lenStr} ${areaStr}`);
    }
    lines.push('------------------------------------------------');
    lines.push(
      `TOTAL ITEMS: ${summary.totalItemCount} | LINEAR: ${
        summary.totalLinearLength > 0 ? `${summary.totalLinearLength.toFixed(1)} ${summary.unit}` : '-'
      }`,
    );

    addAnnotation({
      id: tableId,
      type: 'textbox',
      pageNumber: currentPage,
      rect: { x: 50, y: 50, width: 340, height: Math.max(120, lines.length * 16) },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: {
        text: lines.join('\n'),
        fontSize: 10,
        fontFamily: 'monospace',
        backgroundColor: '#ffffff',
        borderColor: '#0f172a',
        borderWidth: 1.5,
        opacity: 0.95,
      },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4" data-testid="takeoff-inspector-tab">
      {/* Header & Scope Filter */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Quantity Takeoff & Piping Stress
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            CAESAR II / XML Builder integration suite
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
          <button
            type="button"
            onClick={() => setScope('page')}
            className={`px-2 py-1 text-[11px] font-medium rounded ${
              scope === 'page'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Page {currentPage}
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-2 py-1 text-[11px] font-medium rounded ${
              scope === 'all'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All Pages
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
          <span className="block text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase">
            Total Items
          </span>
          <span className="text-base font-bold text-blue-950 dark:text-blue-100">
            {summary.totalItemCount}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60">
          <span className="block text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">
            Linear Total
          </span>
          <span className="text-sm font-bold text-emerald-950 dark:text-emerald-100 truncate block">
            {summary.totalLinearLength > 0 ? `${summary.totalLinearLength.toLocaleString()} ${summary.unit}` : '-'}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60">
          <span className="block text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase">
            Pipe Nodes
          </span>
          <span className="text-sm font-bold text-purple-950 dark:text-purple-100 truncate block">
            {fullModel.coordinateRows.length}
          </span>
        </div>
      </div>

      {/* Scale Status Banner */}
      <div className="flex items-center justify-between p-2 rounded-md bg-slate-100 dark:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-1.5 truncate">
          <Ruler className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">Scale: 1:{currentCalibration.scaleRatio} ({currentCalibration.unit})</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCalibrationDialog(true)}
          className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          Change
        </button>
      </div>

      {/* Layer 1-3: PDF Vector-to-Canvas Porting Card */}
      <div
        data-testid="pdf-vector-port-panel"
        className="p-2.5 rounded-lg border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/60 dark:bg-cyan-950/20 space-y-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-900 dark:text-cyan-200">
              PDF Vector Port
            </span>
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded border border-cyan-200 dark:border-cyan-800 text-[10px]">
            <button
              type="button"
              onClick={() => setPortMode('pipe')}
              className={`px-1.5 py-0.5 rounded font-medium ${
                portMode === 'pipe'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Pipe Runs
            </button>
            <button
              type="button"
              onClick={() => setPortMode('cad')}
              className={`px-1.5 py-0.5 rounded font-medium ${
                portMode === 'cad'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              CAD Shapes
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={portIncludeLabels}
              onChange={(e) => setPortIncludeLabels(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Labels</span>
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={portAttachBranchTags}
              onChange={(e) => setPortAttachBranchTags(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Auto Branch Tags</span>
          </label>
        </div>

        {vectorLayersDetected.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <select
              aria-label="Filter PDF Vector Layer"
              value={portSelectedLayer}
              onChange={(e) => setPortSelectedLayer(e.target.value)}
              className="w-full text-[11px] rounded border border-cyan-200 dark:border-cyan-800 bg-white dark:bg-slate-900 px-1.5 py-0.5"
            >
              <option value="">All PDF Layers ({vectorLayersDetected.length})</option>
              {vectorLayersDetected.map((layer) => (
                <option key={layer} value={layer}>
                  {layer}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="secondary"
            data-testid="port-page-vectors-btn"
            disabled={!pdfDoc || portBusy}
            onClick={() => {
              if (!pdfDoc || portBusy) return;
              setPortBusy(true);
              setRasterTraceStatus('idle');
              setLastRasterRegionRect(null);
              setVectorRoiStatus(null);
              void (async () => {
                try {
                  const page = await pdfDoc.getPage(currentPage);
                  const activePageId = pageGraph?.pages[currentPage - 1]?.pageId;
                  const res = await portPdfPageVectorsToAnnotations(page, {
                    mode: portMode,
                    pageId: activePageId,
                    calibration: currentCalibration,
                    extract: {
                      includeLayers: portSelectedLayer ? [portSelectedLayer] : undefined,
                      includeTextAnchors: portIncludeLabels,
                    },
                    import: {
                      importTextLabels: portIncludeLabels,
                    },
                    attachBranchLabels: portAttachBranchTags,
                  });
                  if (res.layersDetected.length > 0) {
                    setVectorLayersDetected(res.layersDetected);
                  }
                  if (res.annotations.length > 0) {
                    addManyAnnotations(res.annotations, 'Port PDF page vectors');
                    setVectorRoiStatus(
                      `Ported ${res.stats.polylinesCreated} polylines, ${res.stats.linesCreated} lines, ${res.stats.rectsCreated} rects (${res.attachedBranchCount} tagged)`,
                    );
                  } else if (res.isRasterOnlyLikely) {
                    setVectorRoiStatus(
                      `Scanned/raster PDF (${res.imageXObjectCount} image(s), 0 vectors). Use Polyline or OCR.`,
                    );
                  } else {
                    setVectorRoiStatus('No vector geometry detected on current page.');
                  }
                } catch (err) {
                  setVectorRoiStatus(err instanceof Error ? err.message : 'PDF vector port failed.');
                } finally {
                  setPortBusy(false);
                }
              })();
            }}
            className="flex items-center justify-center gap-1 text-[11px] py-1"
            title="Extract editable vector lines, polylines, and tags from this PDF page"
          >
            <ScanLine className="w-3 h-3" />
            <span>{portBusy ? 'Porting...' : 'Port Page'}</span>
          </Button>

          <Button
            type="button"
            variant={vectorRoiCapture ? 'primary' : 'secondary'}
            data-testid="port-region-vectors-btn"
            disabled={!pdfDoc || portBusy}
            onClick={() => {
              if (vectorRoiCapture) {
                cancelVectorRoiCapture();
              } else {
                startVectorRoiCapture({
                  mode: portMode,
                  includeTextLabels: portIncludeLabels,
                  attachBranchLabels: portAttachBranchTags,
                  ...(portSelectedLayer ? { selectedLayer: portSelectedLayer } : {}),
                });
              }
            }}
            className="flex items-center justify-center gap-1 text-[11px] py-1"
            title="Drag a bounding box on the PDF page to port only selected vectors"
          >
            <Crop className="w-3 h-3" />
            <span>{vectorRoiCapture ? 'Cancel Box' : 'Port Region'}</span>
          </Button>
        </div>

        {vectorRoiStatus && (
          <div
            data-testid="vector-port-status"
            className="text-[11px] px-2 py-1 rounded bg-white/80 dark:bg-slate-900/80 border border-cyan-200/80 dark:border-cyan-800/80 text-slate-700 dark:text-slate-300 space-y-1.5"
          >
            <div>{vectorRoiStatus}</div>

            {/* ── Layer 5 & 6: ROI + Tuning + Auto-trace primary action ── */}
            {(vectorRoiStatus.includes('Scanned/raster') ||
              vectorRoiStatus.includes('Auto-trace found no')) && (
              <div className="space-y-1.5 pt-0.5">
                {lastRasterRegionRect && (
                  <div className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200">
                    <span>
                      ROI: {Math.round(lastRasterRegionRect.width)}×{Math.round(lastRasterRegionRect.height)} pt
                    </span>
                    <button
                      type="button"
                      data-testid="raster-clear-roi-btn"
                      onClick={() => setLastRasterRegionRect(null)}
                      className="underline hover:text-cyan-950 dark:hover:text-white"
                    >
                      Use Full Page
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <select
                    aria-label="Raster Threshold Method"
                    data-testid="raster-method-select"
                    value={rasterThresholdMethod}
                    onChange={(e) => setRasterThresholdMethod(e.target.value as 'otsu' | 'bradley')}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5"
                    title="Otsu works best for clean scans; Bradley handles uneven shadows"
                  >
                    <option value="otsu">Otsu</option>
                    <option value="bradley">Bradley</option>
                  </select>
                  <select
                    aria-label="Raster Simplification Tolerance"
                    data-testid="raster-rdp-select"
                    value={String(rasterRdpEpsilonPx)}
                    onChange={(e) => setRasterRdpEpsilonPx(Number(e.target.value))}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5"
                    title="Polyline vertex simplification tolerance (RDP pixels)"
                  >
                    <option value="0.8">Fine 0.8px</option>
                    <option value="1.5">Bal 1.5px</option>
                    <option value="3">Clean 3px</option>
                  </select>
                  <select
                    aria-label="Raster Minimum Segment Length"
                    data-testid="raster-minlen-select"
                    value={String(rasterMinLengthPx)}
                    onChange={(e) => setRasterMinLengthPx(Number(e.target.value))}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5"
                    title="Ignore traced marks shorter than this pixel length"
                  >
                    <option value="10">Min 10px</option>
                    <option value="20">Min 20px</option>
                    <option value="40">Min 40px</option>
                  </select>
                </div>

                {/* Primary: 1-click auto-trace */}
                <Button
                  type="button"
                  variant="primary"
                  data-testid="raster-autotrace-btn"
                  disabled={!pdfDoc || portBusy || rasterTraceStatus === 'rasterizing' || rasterTraceStatus === 'tracing'}
                  onClick={() => {
                    if (!pdfDoc || portBusy) return;
                    setPortBusy(true);
                    setRasterTraceStatus('rasterizing');
                    setVectorRoiStatus(
                      lastRasterRegionRect
                        ? 'Auto-tracing: Rasterizing cropped region…'
                        : 'Auto-tracing: Rasterizing page…',
                    );
                    void (async () => {
                      try {
                        const page = await pdfDoc.getPage(currentPage);
                        const activePageId = pageGraph?.pages[currentPage - 1]?.pageId;
                        setRasterTraceStatus('tracing');
                        setVectorRoiStatus('Auto-tracing: Detecting pipe run centerlines…');
                        const res = await portPdfPageVectorsToAnnotations(
                          page,
                          {
                            mode: portMode,
                            pageId: activePageId,
                            calibration: currentCalibration,
                            extract: {
                              ...(lastRasterRegionRect ? { regionRect: lastRasterRegionRect } : {}),
                              includeTextAnchors: portIncludeLabels,
                            },
                            attachBranchLabels: portAttachBranchTags,
                            autoTraceRaster: true,
                            rasterVectorize: {
                              method: rasterThresholdMethod,
                              rdpEpsilonPx: rasterRdpEpsilonPx,
                              minLengthPx: rasterMinLengthPx,
                            },
                          },
                        );
                        setRasterTraceStatus('done');
                        if (res.rasterTracePolylines > 0) {
                          addManyAnnotations(res.annotations, 'Auto-trace raster pipe runs');
                          setVectorRoiStatus(
                            `Auto-traced ${res.rasterTracePolylines} pipe run(s) from ${lastRasterRegionRect ? 'cropped region' : 'scanned image'}.`,
                          );
                        } else {
                          setVectorRoiStatus(
                            'Auto-trace found no pipe runs. Try manual Trace or OCR.',
                          );
                        }
                      } catch (err) {
                        setRasterTraceStatus('error');
                        setVectorRoiStatus(
                          `Auto-trace failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                      } finally {
                        setPortBusy(false);
                      }
                    })();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>
                    {rasterTraceStatus === 'rasterizing'
                      ? 'Rasterizing…'
                      : rasterTraceStatus === 'tracing'
                      ? 'Detecting lines…'
                      : lastRasterRegionRect
                      ? 'Auto-Trace Region'
                      : 'Auto-Trace Pipe Runs'}
                  </span>
                </Button>

                {/* Secondary fallbacks */}
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="raster-fallback-trace-btn"
                    onClick={() => {
                      cancelVectorRoiCapture();
                      setCalloutActiveTool('select');
                      setActiveTool('perimeter-takeoff');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] py-0.5"
                  >
                    <Waypoints className="w-3 h-3" />
                    <span>Trace Polyline</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="raster-fallback-ocr-btn"
                    onClick={() => {
                      cancelVectorRoiCapture();
                      setActiveTool('select');
                      setCalloutActiveTool('ocr-region');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] py-0.5"
                  >
                    <ScanText className="w-3 h-3" />
                    <span>OCR Region</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grouped Items List */}
      <div className="space-y-1.5">
        <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Aggregated Takeoff Items ({summary.groups.length})
        </span>

        {summary.groups.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            No annotations found on this {scope === 'page' ? 'page' : 'document'}.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
            {summary.groups.map((group, idx) => (
              <div key={`${group.type}-${group.label}-${idx}`} className="p-2.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                <div className="min-w-0 pr-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={group.label}>
                    {group.label}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="uppercase">{group.type}</span>
                    <span>•</span>
                    <span>P. {group.pages.join(', ')}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold text-[11px]">
                    Qty: {group.count}
                  </span>
                  {group.totalLengthReal > 0 && (
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {group.totalLengthReal.toFixed(1)} {group.unit}
                    </div>
                  )}
                  {group.totalAreaReal > 0 && (
                    <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">
                      {group.totalAreaReal.toFixed(1)} {group.unit}²
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Standard Takeoff Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          onClick={handleExportCsv}
          disabled={summary.groups.length === 0}
          className="flex items-center justify-center gap-1.5 text-xs py-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={handleStampScheduleToSheet}
          disabled={summary.groups.length === 0}
          className="flex items-center justify-center gap-1.5 text-xs py-1.5"
          title="Stamps the Quantity Takeoff BOM table directly onto the active PDF sheet"
        >
          <TableProperties className="w-3.5 h-3.5" />
          <span>Stamp to Sheet</span>
        </Button>
      </div>

      {/* XML Builder & CAESAR II Interoperability Suite */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              XML Builder & CAESAR II
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="takeoff-open-3d-tab-btn"
              onClick={() => setWorkspaceViewMode(workspaceViewMode === '3d' ? '2d' : '3d')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                workspaceViewMode === '3d'
                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 border border-slate-200 dark:border-slate-700'
              }`}
              title={workspaceViewMode === '3d' ? 'Switch back to 2D Document Canvas' : 'Open in 3D Canvas Tab'}
            >
              <Rotate3d className="w-3 h-3" />
              <span>{workspaceViewMode === '3d' ? '3D Tab Active' : 'Open in Tab'}</span>
            </button>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-semibold">
              5-Table Model
            </span>
          </div>
        </div>

        {/* 3D Tab Active Banner or Side Panel Viewer */}
        {workspaceViewMode === '3d' ? (
          <div
            data-testid="takeoff-3d-active-banner"
            className="flex items-center justify-between p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <Rotate3d className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Viewing in Main 3D Canvas Tab</span>
            </div>
            <button
              type="button"
              onClick={() => setWorkspaceViewMode('2d')}
              className="text-[11px] underline hover:text-purple-900 dark:hover:text-purple-100 font-medium"
            >
              Return to 2D
            </button>
          </div>
        ) : (
          show3DViewer && (
            <Piping3DViewer
              model={fullModel}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )
        )}

        {/* Branch, Elevation & 3D Routing Mode inputs */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <label htmlFor="piping-branch-input" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
              Branch Name
            </label>
            <input
              id="piping-branch-input"
              aria-label="Branch Name"
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono"
            />
          </div>
          <div>
            <label htmlFor="piping-elevation-input" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
              Elevation Z (mm)
            </label>
            <input
              id="piping-elevation-input"
              aria-label="Elevation Z (mm)"
              type="number"
              value={elevationZ}
              onChange={(e) => setElevationZ(Number(e.target.value))}
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono"
            />
          </div>
          <div>
            <label htmlFor="piping-routing-mode-select" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
              3D Routing
            </label>
            <select
              id="piping-routing-mode-select"
              aria-label="3D Routing Mode"
              value={routingMode}
              onChange={(e) => setRoutingMode(e.target.value as PipelineRoutingMode)}
              className="w-full text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 font-mono font-medium"
            >
              <option value="plan">Plan (2D)</option>
              <option value="isometric">ISO (3D Riser)</option>
            </select>
          </div>
        </div>

        {/* Bidirectional 5-Table Round-Trip Grid */}
        <PipingTableGrid
          onApplyToSheet={handleApplyTableToSheet}
          onResetFromSheet={handleResetFromSheet}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />

        {/* 1-Click Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleCopyTableTsv(activeTableTab)}
            className="flex items-center justify-center gap-1 text-xs py-1.5"
            title="Copies the active table TSV for XML Builder"
          >
            {copiedKey === activeTableTab ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === activeTableTab ? 'Copied TSV!' : `Copy ${activeTableTab.slice(0, 5)} TSV`}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleDownloadCaesarXml}
            className="flex items-center justify-center gap-1 text-xs py-1.5 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40"
            title="Compiles and downloads standard CAESAR II XML input file"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Download CII XML</span>
          </Button>
        </div>

        {/* Primary Cross-App Bridge Button */}
        <Button
          type="button"
          variant="primary"
          onClick={handleLaunchXmlBuilder}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold shadow-xs"
          title="Opens XML Compare Utilities with all 5 tables pre-populated in XML Builder"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open in XML Builder (Web App)</span>
        </Button>
      </div>

      {/* Phase P 3D Extrusion & Modeling Controls */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
        <Cad3DInspectorSection />
      </div>

      {showCalibrationDialog && (
        <ScaleCalibrationDialog
          isOpen={showCalibrationDialog}
          currentPage={currentPage}
          totalDocumentPages={totalPages}
          currentCalibration={currentCalibration}
          onClose={() => setShowCalibrationDialog(false)}
          onApply={(cal, applyScope) => {
            if (applyScope === 'all') {
              setAllPagesCalibration(cal);
            } else {
              setPageCalibration(currentPage, cal);
            }
          }}
        />
      )}
    </div>
  );
};
