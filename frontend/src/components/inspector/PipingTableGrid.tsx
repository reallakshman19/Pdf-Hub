import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePipingTableStore } from '@/core/pipeline-geometry/table-store/pipingTableStore';
import type { TableKind } from '@/core/pipeline-geometry/table-store/types';
import { Check, Upload, RotateCcw, Save } from 'lucide-react';
import type { ComponentType, RestraintType } from '@/core/pipeline-geometry/types';

export interface PipingTableGridProps {
  onApplyToSheet: () => void;
  onResetFromSheet: () => void;
  selectedNode: number | null;
  onSelectNode: (nodeNumber: number | null) => void;
}

export const PipingTableGrid: React.FC<PipingTableGridProps> = ({
  onApplyToSheet,
  onResetFromSheet,
  selectedNode,
  onSelectNode,
}) => {
  const {
    activeTableTab,
    setActiveTableTab,
    coordinateRows,
    branchRows,
    restraintRows,
    weightRows,
    dtxrRows,
    dirtyCells,
    updateCoordinateRow,
    updateRestraintRow,
    updateWeightRow,
    updateBranchRow,
    updateDtxrRow,
    pasteTsvToTable,
  } = usePipingTableStore(
    useShallow((state) => ({
      activeTableTab: state.activeTableTab,
      setActiveTableTab: state.setActiveTableTab,
      coordinateRows: state.coordinateRows,
      branchRows: state.branchRows,
      restraintRows: state.restraintRows,
      weightRows: state.weightRows,
      dtxrRows: state.dtxrRows,
      dirtyCells: state.dirtyCells,
      updateCoordinateRow: state.updateCoordinateRow,
      updateRestraintRow: state.updateRestraintRow,
      updateWeightRow: state.updateWeightRow,
      updateBranchRow: state.updateBranchRow,
      updateDtxrRow: state.updateDtxrRow,
      pasteTsvToTable: state.pasteTsvToTable,
    })),
  );

  const [editingCell, setEditingCell] = useState<{
    table: TableKind;
    nodeNumber: number;
    field: string;
    value: string;
  } | null>(null);

  const [pasteSuccess, setPasteSuccess] = useState(false);

  const dirtyCount = Object.keys(dirtyCells).length;

  const handleStartEdit = (table: TableKind, nodeNumber: number, field: string, currentValue: unknown) => {
    setEditingCell({
      table,
      nodeNumber,
      field,
      value: String(currentValue ?? ''),
    });
  };

  const handleCommitEdit = () => {
    if (!editingCell) return;
    const { table, nodeNumber, field, value } = editingCell;

    if (table === 'coordinates') {
      const numFields = ['x', 'y', 'z', 'lengthToNextMm'];
      const parsedVal = numFields.includes(field) ? Number(value) : value;
      updateCoordinateRow(nodeNumber, { [field]: parsedVal });
    } else if (table === 'restraints') {
      updateRestraintRow(nodeNumber, { [field]: value as RestraintType });
    } else if (table === 'weights') {
      const parsedVal = field === 'weight' ? Number(value) : value;
      updateWeightRow(nodeNumber, { [field]: parsedVal as ComponentType });
    } else if (table === 'branches') {
      const numFields = ['boreMm', 'wallThickness', 'p1', 't1'];
      const parsedVal = numFields.includes(field) ? Number(value) : value;
      updateBranchRow(nodeNumber, { [field]: parsedVal });
    } else if (table === 'dtxr') {
      updateDtxrRow(nodeNumber, { [field]: value });
    }

    setEditingCell(null);
    // Trigger reverse sync to sheet
    onApplyToSheet();
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          const success = pasteTsvToTable(activeTableTab, text);
          if (success) {
            setPasteSuccess(true);
            setTimeout(() => setPasteSuccess(false), 2000);
            onApplyToSheet();
          }
        }
      }
    } catch {
      // Fallback
    }
  };

  const isCellDirty = (table: TableKind, nodeNumber: number, field: string) => {
    return !!dirtyCells[`${table}:${nodeNumber}:${field}`];
  };

  return (
    <div data-testid="piping-table-grid" className="space-y-2">
      {/* 5-Table Sub-Tab Selector & Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 text-[11px]">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            data-testid="tab-coords"
            onClick={() => setActiveTableTab('coordinates')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium transition-colors ${
              activeTableTab === 'coordinates'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Coords ({coordinateRows.length})
          </button>
          <button
            type="button"
            data-testid="tab-branches"
            onClick={() => setActiveTableTab('branches')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium transition-colors ${
              activeTableTab === 'branches'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Branches ({branchRows.length})
          </button>
          <button
            type="button"
            data-testid="tab-supports"
            onClick={() => setActiveTableTab('restraints')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium transition-colors ${
              activeTableTab === 'restraints'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Supports ({restraintRows.length})
          </button>
          <button
            type="button"
            data-testid="tab-valves"
            onClick={() => setActiveTableTab('weights')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium transition-colors ${
              activeTableTab === 'weights'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Valves ({weightRows.length})
          </button>
          <button
            type="button"
            data-testid="tab-nozzles"
            onClick={() => setActiveTableTab('dtxr')}
            className={`px-2 py-1 rounded-t whitespace-nowrap font-medium transition-colors ${
              activeTableTab === 'dtxr'
                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-b-2 border-purple-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Nozzles ({dtxrRows.length})
          </button>
        </div>

        {/* Action Buttons: Paste TSV, Apply to Sheet, Reset */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="paste-tsv-btn"
            onClick={handlePasteClipboard}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              pasteSuccess
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
            title="Paste TSV rows from clipboard into active table"
          >
            {pasteSuccess ? <Check className="w-3 h-3 text-emerald-600" /> : <Upload className="w-3 h-3" />}
            <span>{pasteSuccess ? 'Pasted!' : 'Paste'}</span>
          </button>

          {dirtyCount > 0 && (
            <>
              <button
                type="button"
                data-testid="apply-to-sheet-btn"
                onClick={onApplyToSheet}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                title="Sync table changes back to 2D drawing sheet"
              >
                <Save className="w-3 h-3" />
                <span>Apply ({dirtyCount})</span>
              </button>
              <button
                type="button"
                data-testid="reset-from-sheet-btn"
                onClick={onResetFromSheet}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:text-slate-700"
                title="Discard manual table changes and reset from drawing sheet"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Content Tables with Inline Cell Editing */}
      <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-950 font-mono text-[10.5px]">
        {activeTableTab === 'coordinates' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1">Node</th>
                <th className="px-2 py-1">X (East)</th>
                <th className="px-2 py-1">Y (North)</th>
                <th className="px-2 py-1">Z (Elev)</th>
                <th className="px-2 py-1">Length</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {coordinateRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-400 italic">No coordinates drafted</td>
                </tr>
              ) : (
                coordinateRows.map((r, i) => {
                  const isSelected = selectedNode === r.nodeNumber;
                  const isXEditing = editingCell?.nodeNumber === r.nodeNumber && editingCell?.field === 'x';
                  const isYEditing = editingCell?.nodeNumber === r.nodeNumber && editingCell?.field === 'y';
                  const isZEditing = editingCell?.nodeNumber === r.nodeNumber && editingCell?.field === 'z';

                  return (
                    <tr
                      key={`${r.nodeNumber}-${i}`}
                      ref={(el) => {
                        if (isSelected && el) {
                          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => onSelectNode(r.nodeNumber)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-100 dark:bg-cyan-950/70 border-l-4 border-cyan-500 font-semibold text-cyan-900 dark:text-cyan-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <td className="px-2 py-0.5 font-bold text-blue-600 dark:text-blue-400">
                        {r.nodeNumber}
                      </td>

                      {/* X Cell */}
                      <td
                        className={`px-2 py-0.5 ${isCellDirty('coordinates', r.nodeNumber, 'x') ? 'text-amber-600 font-bold' : ''}`}
                        onDoubleClick={() => handleStartEdit('coordinates', r.nodeNumber, 'x', r.x)}
                      >
                        {isXEditing ? (
                          <input
                            type="number"
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1 py-0.2 text-xs border rounded bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span>{r.x.toLocaleString()}</span>
                        )}
                      </td>

                      {/* Y Cell */}
                      <td
                        className={`px-2 py-0.5 ${isCellDirty('coordinates', r.nodeNumber, 'y') ? 'text-amber-600 font-bold' : ''}`}
                        onDoubleClick={() => handleStartEdit('coordinates', r.nodeNumber, 'y', r.y)}
                      >
                        {isYEditing ? (
                          <input
                            type="number"
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1 py-0.2 text-xs border rounded bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span>{r.y.toLocaleString()}</span>
                        )}
                      </td>

                      {/* Z Cell */}
                      <td
                        className={`px-2 py-0.5 text-emerald-600 dark:text-emerald-400 ${
                          isCellDirty('coordinates', r.nodeNumber, 'z') ? 'text-amber-600 font-bold' : ''
                        }`}
                        onDoubleClick={() => handleStartEdit('coordinates', r.nodeNumber, 'z', r.z)}
                      >
                        {isZEditing ? (
                          <input
                            type="number"
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1 py-0.2 text-xs border rounded bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span>{r.z.toLocaleString()}</span>
                        )}
                      </td>

                      {/* Length */}
                      <td className="px-2 py-0.5 text-slate-400">
                        {r.lengthToNextMm ? `${r.lengthToNextMm.toLocaleString()} mm` : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTableTab === 'branches' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1">Branch</th>
                <th className="px-2 py-1">Node</th>
                <th className="px-2 py-1">Bore</th>
                <th className="px-2 py-1">Wall</th>
                <th className="px-2 py-1">P1 / T1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {branchRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-400 italic">No branch data</td>
                </tr>
              ) : (
                branchRows.map((r, i) => {
                  const isSelected = selectedNode === r.nodeNumber;
                  return (
                    <tr
                      key={`${r.branchName}-${i}`}
                      ref={(el) => {
                        if (isSelected && el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }}
                      onClick={() => onSelectNode(r.nodeNumber)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-100 dark:bg-cyan-950/70 border-l-4 border-cyan-500 font-semibold text-cyan-900 dark:text-cyan-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <td className="px-2 py-0.5 truncate max-w-[90px]" title={r.branchName}>{r.branchName}</td>
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.boreMm} mm</td>
                      <td className="px-2 py-0.5">{r.wallThickness} mm</td>
                      <td className="px-2 py-0.5">{r.p1} bar / {r.t1}°C</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTableTab === 'restraints' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1">Node</th>
                <th className="px-2 py-1">Support Tag</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Friction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {restraintRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-slate-400 italic">No supports tagged</td>
                </tr>
              ) : (
                restraintRows.map((r, i) => {
                  const isSelected = selectedNode === r.nodeNumber;
                  const isTagEditing = editingCell?.nodeNumber === r.nodeNumber && editingCell?.field === 'nodeName';
                  return (
                    <tr
                      key={`${r.nodeNumber}-${i}`}
                      ref={(el) => {
                        if (isSelected && el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }}
                      onClick={() => onSelectNode(r.nodeNumber)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-100 dark:bg-cyan-950/70 border-l-4 border-cyan-500 font-semibold text-cyan-900 dark:text-cyan-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td
                        className={`px-2 py-0.5 ${isCellDirty('restraints', r.nodeNumber, 'nodeName') ? 'text-amber-600 font-bold' : ''}`}
                        onDoubleClick={() => handleStartEdit('restraints', r.nodeNumber, 'nodeName', r.nodeName)}
                      >
                        {isTagEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onBlur={handleCommitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-20 px-1 py-0.2 text-xs border rounded bg-white dark:bg-slate-800"
                          />
                        ) : (
                          <span>{r.nodeName}</span>
                        )}
                      </td>
                      <td className="px-2 py-0.5 font-semibold text-purple-600">{r.restraintType}</td>
                      <td className="px-2 py-0.5 text-slate-400">{r.friction ?? 0.3}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTableTab === 'weights' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1">Node</th>
                <th className="px-2 py-1">Component</th>
                <th className="px-2 py-1">Weight</th>
                <th className="px-2 py-1">Ref No</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {weightRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-slate-400 italic">No valves or components tagged</td>
                </tr>
              ) : (
                weightRows.map((r, i) => {
                  const isSelected = selectedNode === r.nodeNumber;
                  return (
                    <tr
                      key={`${r.nodeNumber}-${i}`}
                      ref={(el) => {
                        if (isSelected && el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }}
                      onClick={() => onSelectNode(r.nodeNumber)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-100 dark:bg-cyan-950/70 border-l-4 border-cyan-500 font-semibold text-cyan-900 dark:text-cyan-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5 font-semibold text-emerald-600">{r.componentType}</td>
                      <td className="px-2 py-0.5">{r.weight} kg</td>
                      <td className="px-2 py-0.5 text-slate-500">{r.componentRefNo}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTableTab === 'dtxr' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1">Node</th>
                <th className="px-2 py-1">Branch</th>
                <th className="px-2 py-1">Displacement / Vector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {dtxrRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-slate-400 italic">No nozzles or displacements</td>
                </tr>
              ) : (
                dtxrRows.map((r, i) => {
                  const isSelected = selectedNode === r.nodeNumber;
                  return (
                    <tr
                      key={`${r.nodeNumber}-${i}`}
                      ref={(el) => {
                        if (isSelected && el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }}
                      onClick={() => onSelectNode(r.nodeNumber)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-100 dark:bg-cyan-950/70 border-l-4 border-cyan-500 font-semibold text-cyan-900 dark:text-cyan-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <td className="px-2 py-0.5 font-bold text-blue-600">{r.nodeNumber}</td>
                      <td className="px-2 py-0.5">{r.branchName}</td>
                      <td className="px-2 py-0.5 text-slate-500 font-mono">{r.dtxr}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
