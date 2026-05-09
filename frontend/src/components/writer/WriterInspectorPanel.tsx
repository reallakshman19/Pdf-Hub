// @ts-nocheck
import React from 'react';
import { useWriterStore } from '@/core/writer/store';
import { Lock, Unlock, ArrowUpToLine, ArrowDownToLine, PenTool, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

export const WriterInspectorPanel: React.FC = () => {
  const { elements, selectedIds, activeId, updateSelectedElements, bringToFront, sendToBack } = useWriterStore();

  const activeElement = elements.find(e => e.id === activeId);

  if (!activeElement || selectedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
          <Settings className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">No selection</p>
        <p className="text-xs">Select a writer element to edit its properties.</p>
      </div>
    );
  }

  const isMultiple = selectedIds.length > 1;
  const isLocked = activeElement.locked;

  const handleNumericChange = (key: 'x' | 'y' | 'width' | 'height', value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      updateSelectedElements({ [key]: num });
    }
  };

  const handleStyleChange = (key: keyof typeof activeElement.styles, value: string | number) => {
    updateSelectedElements({ styles: { ...activeElement.styles, [key]: value } });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 overflow-y-auto">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PenTool className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Writer Element
            {isMultiple && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">{selectedIds.length}</span>}
          </h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{activeElement.type}</p>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip content={isLocked ? 'Unlock Element' : 'Lock Element'}>
            <Button
              variant={isLocked ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => updateSelectedElements({ locked: !isLocked })}
              title={isLocked ? "Unlock Element" : "Lock Element"}
            >
              {isLocked ? <Lock className="w-4 h-4 text-blue-600" /> : <Unlock className="w-4 h-4" />}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="p-4 space-y-6">

        {/* Dimensions */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Layout</h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">X</span>
              <input
                type="number"
                value={Math.round(activeElement.x)}
                onChange={(e) => handleNumericChange('x', e.target.value)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Y</span>
              <input
                type="number"
                value={Math.round(activeElement.y)}
                onChange={(e) => handleNumericChange('y', e.target.value)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Width</span>
              <input
                type="number"
                value={Math.round(activeElement.width)}
                onChange={(e) => handleNumericChange('width', e.target.value)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Height</span>
              <input
                type="number"
                value={Math.round(activeElement.height)}
                onChange={(e) => handleNumericChange('height', e.target.value)}
                disabled={isLocked}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-sm disabled:opacity-50"
              />
            </label>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-3">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Appearance</h4>

          <label className="flex items-center justify-between">
            <span className="text-xs text-slate-700 dark:text-slate-300">Opacity</span>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={activeElement.styles.opacity ?? 1}
              onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="text-xs font-mono text-slate-500 w-8 text-right">
              {Math.round((activeElement.styles.opacity ?? 1) * 100)}%
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Background</span>
              <input
                type="color"
                value={activeElement.styles.backgroundColor || '#ffffff'}
                onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                className="w-full h-8 rounded border border-slate-300 p-0 cursor-pointer"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500">Border Color</span>
              <input
                type="color"
                value={activeElement.styles.borderColor || '#000000'}
                onChange={(e) => handleStyleChange('borderColor', e.target.value)}
                className="w-full h-8 rounded border border-slate-300 p-0 cursor-pointer"
              />
            </label>
          </div>

          <label className="block space-y-1 pt-2">
            <div className="flex justify-between">
              <span className="text-xs text-slate-500">Border Width</span>
              <span className="text-xs font-mono text-slate-500">{activeElement.styles.borderWidth || 0}px</span>
            </div>
            <input
              type="range"
              min="0" max="10" step="1"
              value={activeElement.styles.borderWidth || 0}
              onChange={(e) => handleStyleChange('borderWidth', parseInt(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="block space-y-1 pt-2">
             <div className="flex justify-between">
               <span className="text-xs text-slate-500">Padding</span>
               <span className="text-xs font-mono text-slate-500">{activeElement.styles.padding || 0}px</span>
             </div>
             <input
               type="range"
               min="0" max="40" step="2"
               value={activeElement.styles.padding || 0}
               onChange={(e) => handleStyleChange('padding', parseInt(e.target.value))}
               className="w-full"
             />
           </label>
        </section>

        {/* Arrange */}
        <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Arrange</h4>
          <div className="flex gap-2">
            <Tooltip content="Bring selected element to front">
              <Button variant="secondary" className="flex-1 text-xs" onClick={() => bringToFront(activeElement.id)}>
                <ArrowUpToLine className="w-3 h-3 mr-1" /> Front
              </Button>
            </Tooltip>
            <Tooltip content="Send selected element to back">
              <Button variant="secondary" className="flex-1 text-xs" onClick={() => sendToBack(activeElement.id)}>
                <ArrowDownToLine className="w-3 h-3 mr-1" /> Back
              </Button>
            </Tooltip>
          </div>
        </section>

      </div>
    </div>
  );
};
