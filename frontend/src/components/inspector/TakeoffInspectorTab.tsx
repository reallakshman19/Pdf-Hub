import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import {
  computeTakeoffSummary,
  generateTakeoffCsv,
} from '@/core/annotations/takeoffExport';
import {
  extractFullXmlBuilderModel,
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
} from 'lucide-react';
import { ScaleCalibrationDialog } from '@/components/dialogs/ScaleCalibrationDialog';

type XmlBuilderTab = 'coordinates' | 'branches' | 'restraints' | 'weights' | 'dtxr';

export const TakeoffInspectorTab: React.FC = () => {
  const [scope, setScope] = useState<'all' | 'page'>('page');
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false);
  const [activeXmlTab, setActiveXmlTab] = useState<XmlBuilderTab>('coordinates');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('/CUSTOM-4"-PIPE/B1');
  const [startNode] = useState(100);
  const [elevationZ, setElevationZ] = useState(100000);

  const currentPage = useSessionStore((state) => state.viewState.currentPage);
  const totalPages = useSessionStore((state) => state.pageCount || 1);

  const {
    annotations,
    getPageCalibration,
    setPageCalibration,
    setAllPagesCalibration,
    addAnnotation,
  } = useAnnotationStore(
    useShallow((state) => ({
      annotations: state.annotations,
      getPageCalibration: state.getPageCalibration,
      setPageCalibration: state.setPageCalibration,
      setAllPagesCalibration: state.setAllPagesCalibration,
      addAnnotation: state.addAnnotation,
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

  const fullModel = useMemo(() => {
    return extractFullXmlBuilderModel(filteredAnnotations, getPageCalibration, {
      branchName,
      startNodeNumber: startNode,
      defaultElevationZ: elevationZ,
    });
  }, [filteredAnnotations, getPageCalibration, branchName, startNode, elevationZ]);

  const tsvTables = useMemo(() => {
    return serializeXmlBuilderTablesToTsv(fullModel);
  }, [fullModel]);

  const handleCopyTableTsv = async (tab: XmlBuilderTab) => {
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
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono font-semibold">
            5-Table Model
          </span>
        </div>

        {/* Branch & Elevation inputs */}
        <div className="grid grid-cols-2 gap-2 text-xs">
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
        </div>

        {/* 5-Table Sub-Tab Selector */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1 text-[11px] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveXmlTab('coordinates')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium ${
              activeXmlTab === 'coordinates'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Coords ({fullModel.coordinateRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveXmlTab('branches')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium ${
              activeXmlTab === 'branches'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Branches ({fullModel.branchRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveXmlTab('restraints')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium ${
              activeXmlTab === 'restraints'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Supports ({fullModel.restraintRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveXmlTab('weights')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium ${
              activeXmlTab === 'weights'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Valves ({fullModel.weightRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveXmlTab('dtxr')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium ${
              activeXmlTab === 'dtxr'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Nozzles ({fullModel.dtxrRows.length})
          </button>
        </div>

        {/* Tab Content Tables */}
        <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-950 font-mono text-[10.5px]">
          {activeXmlTab === 'coordinates' && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Node</th>
                  <th className="px-2 py-1">X (East)</th>
                  <th className="px-2 py-1">Y (North)</th>
                  <th className="px-2 py-1">Z (Elev)</th>
                  <th className="px-2 py-1">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {fullModel.coordinateRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-slate-400 italic">No coordinates drafted</td>
                  </tr>
                ) : (
                  fullModel.coordinateRows.slice(0, 10).map((r, i) => (
                    <tr key={`${r.nodeNumber}-${i}`}>
                      <td className="px-2 py-0.5 font-bold text-blue-600 dark:text-blue-400">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.x.toLocaleString()}</td>
                      <td className="px-2 py-0.5">{r.y.toLocaleString()}</td>
                      <td className="px-2 py-0.5">{r.z.toLocaleString()}</td>
                      <td className="px-2 py-0.5 text-slate-400">{r.lengthToNextMm ? `${r.lengthToNextMm.toLocaleString()} mm` : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeXmlTab === 'branches' && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Branch</th>
                  <th className="px-2 py-1">Node</th>
                  <th className="px-2 py-1">Bore</th>
                  <th className="px-2 py-1">Wall</th>
                  <th className="px-2 py-1">P1 / T1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {fullModel.branchRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-slate-400 italic">No branch data</td>
                  </tr>
                ) : (
                  fullModel.branchRows.map((r, i) => (
                    <tr key={`${r.branchName}-${i}`}>
                      <td className="px-2 py-0.5 truncate max-w-[90px]" title={r.branchName}>{r.branchName}</td>
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.boreMm} mm</td>
                      <td className="px-2 py-0.5">{r.wallThickness} mm</td>
                      <td className="px-2 py-0.5">{r.p1} bar / {r.t1}°C</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeXmlTab === 'restraints' && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Node</th>
                  <th className="px-2 py-1">Support Tag</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Friction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {fullModel.restraintRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-slate-400 italic">No supports tagged</td>
                  </tr>
                ) : (
                  fullModel.restraintRows.map((r, i) => (
                    <tr key={`${r.nodeNumber}-${i}`}>
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.nodeName}</td>
                      <td className="px-2 py-0.5 font-semibold text-emerald-600">{r.restraintType}</td>
                      <td className="px-2 py-0.5 text-slate-400">{r.friction ?? '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeXmlTab === 'weights' && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Node</th>
                  <th className="px-2 py-1">Valve Ref</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {fullModel.weightRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-slate-400 italic">No valves or components tagged</td>
                  </tr>
                ) : (
                  fullModel.weightRows.map((r, i) => (
                    <tr key={`${r.nodeNumber}-${i}`}>
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.componentRefNo}</td>
                      <td className="px-2 py-0.5 text-purple-600">{r.componentType}</td>
                      <td className="px-2 py-0.5">{r.weight} kg</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeXmlTab === 'dtxr' && (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="px-2 py-1">Node</th>
                  <th className="px-2 py-1">Thermal Growth / Displacements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {fullModel.dtxrRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-3 text-center text-slate-400 italic">No nozzle displacements tagged</td>
                  </tr>
                ) : (
                  fullModel.dtxrRows.map((r, i) => (
                    <tr key={`${r.nodeNumber}-${i}`}>
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.dtxr}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* 1-Click Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleCopyTableTsv(activeXmlTab)}
            className="flex items-center justify-center gap-1 text-xs py-1.5"
            title="Copies the active table TSV for XML Builder"
          >
            {copiedKey === activeXmlTab ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === activeXmlTab ? 'Copied TSV!' : `Copy ${activeXmlTab.slice(0, 5)} TSV`}</span>
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
