import React, { useState } from 'react';
import { useWriterStore } from '../../core/writer/store';
import type { PlacedElement } from '../../core/writer/types';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

interface Props {
  element: PlacedElement;
  scale: number;
  onClose: () => void;
}

import type { WriterTableData } from '../../core/writer/types';

export const TableEditorPanel: React.FC<Props> = ({ element, scale, onClose }) => {
  const { updateElement } = useWriterStore();

  const [data, setData] = useState<WriterTableData>(() => {
    try {
      const parsed = JSON.parse(element.content || '{"rows":[],"columns":[],"style":{}}');
      // Migration logic from old structure if necessary
      if (parsed.headers) {
         return {
            columns: parsed.headers.map((_h: string, i: number) => ({ id: `col-${i}` })),
            rows: [
              { id: 'header-row', cells: parsed.headers.map((h: string, i: number) => ({ id: `h-${i}`, text: h })) },
              ...parsed.rows.map((r: string[], rIdx: number) => ({
                 id: `r-${rIdx}`,
                 cells: r.map((c, cIdx) => ({ id: `c-${rIdx}-${cIdx}`, text: c }))
              }))
            ],
            style: { borderColor: parsed.borderColor || '#d1d5db', headerBg: parsed.headerBg || '#f1f5f9' }
         }
      }
      return parsed as WriterTableData;
    } catch {
      return { rows: [], columns: [], style: { borderColor: '#d1d5db', headerBg: '#f1f5f9' } };
    }
  });

  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const updateTable = (newData: WriterTableData) => {
    setData(newData);
    updateElement(element.id, { content: JSON.stringify(newData) });
  };

  const handleCellChange = (rIdx: number, cIdx: number, val: string) => {
    const newRows = [...data.rows];
    const newCells = [...newRows[rIdx].cells];
    newCells[cIdx] = { ...newCells[cIdx], text: val };
    newRows[rIdx] = { ...newRows[rIdx], cells: newCells };
    updateTable({ ...data, rows: newRows });
  };

  const addRow = () => {
    const newCells = data.columns.map((_, i) => ({ id: `new-c-${crypto.randomUUID()}-${i}`, text: '' }));
    updateTable({ ...data, rows: [...data.rows, { id: `new-r-${crypto.randomUUID()}`, cells: newCells }] });
  };

  const addCol = () => {
    const newColId = `new-col-${crypto.randomUUID()}`;
    const newColumns = [...data.columns, { id: newColId }];
    const newRows = data.rows.map(r => ({
      ...r,
      cells: [...r.cells, { id: `new-c-${crypto.randomUUID()}-${r.id}`, text: '' }]
    }));
    updateTable({ ...data, columns: newColumns, rows: newRows });
  };

  const deleteRow = () => {
    if (selectedRow === null) return;
    const newRows = data.rows.filter((_, i) => i !== selectedRow);
    updateTable({ ...data, rows: newRows });
    setSelectedRow(null);
  };

  const deleteCol = () => {
    if (selectedCol === null) return;
    const newColumns = data.columns.filter((_, i) => i !== selectedCol);
    const newRows = data.rows.map(r => ({
      ...r,
      cells: r.cells.filter((_, i) => i !== selectedCol)
    }));
    updateTable({ ...data, columns: newColumns, rows: newRows });
    setSelectedCol(null);
  };

  return (
    <div style={{
      position: 'absolute',
      left: element.x * scale,
      top: (element.y + element.height) * scale + 10,
      background: 'var(--color-background-primary)',
      border: '0.5px solid var(--color-border-secondary)',
      borderRadius: 8,
      padding: '12px',
      zIndex: 9999,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minWidth: 320,
    }}
    onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <Tooltip content="Add Column">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addCol}>
            <Plus className="w-4 h-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Delete Selected Column">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={deleteCol} disabled={selectedCol === null}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <div style={{ width: 1, height: 16, background: 'var(--color-border-tertiary)', margin: '0 4px' }} />

        <Tooltip content="Add Row">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addRow}>
            <Plus className="w-4 h-4 rotate-90" />
          </Button>
        </Tooltip>
        <Tooltip content="Delete Selected Row">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={deleteRow} disabled={selectedRow === null}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Tooltip content="Border Color">
            <input type="color" value={data.style?.borderColor || '#d1d5db'} onChange={e => updateTable({ ...data, style: { ...data.style, borderColor: e.target.value } })} className="w-6 h-6 p-0 border-0 cursor-pointer" />
          </Tooltip>
          <Tooltip content="Header Background">
            <input type="color" value={data.style?.headerBg || '#f1f5f9'} onChange={e => updateTable({ ...data, style: { ...data.style, headerBg: e.target.value } })} className="w-6 h-6 p-0 border-0 cursor-pointer" />
          </Tooltip>
        </div>

        <Tooltip content="Close">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 ml-2" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="overflow-auto max-h-[300px]">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {data.rows.map((row, rIdx) => (
              <tr key={row.id} className="relative">
                {row.cells.map((cell, cIdx) => {
                  const isHeader = rIdx === 0;
                  const bg = isHeader ? (data.style?.headerBg || '#f1f5f9') : 'transparent';
                  return (
                    <td key={cell.id} style={{ border: `1px solid ${data.style?.borderColor || '#ccc'}`, padding: 4, position: 'relative', background: bg }}>
                      <input
                        value={cell.text}
                        onChange={e => handleCellChange(rIdx, cIdx, e.target.value)}
                        onFocus={() => { setSelectedCol(cIdx); setSelectedRow(rIdx); }}
                        style={{ width: '100%', minWidth: 60, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontWeight: isHeader ? 500 : 'normal', color: 'var(--color-text-primary)' }}
                      />
                      {selectedCol === cIdx && <div className="absolute inset-y-0 left-0 right-0 border-x-2 border-blue-500 pointer-events-none" />}
                      {selectedRow === rIdx && <div className="absolute inset-x-0 top-0 bottom-0 border-y-2 border-blue-500 pointer-events-none z-10" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};