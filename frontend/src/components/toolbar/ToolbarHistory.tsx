import React from 'react';
import { Button } from '@/components/ui/Button';
import { Undo, Redo } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { HISTORY_POLICY } from '@/core/document-history/historyPolicy';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export const ToolbarHistory: React.FC = () => {
  const {
    canUndo,
    canRedo,
    peekUndo,
    peekRedo,
    retainedBytes,
    droppedTransactions,
    overBudget,
  } = useHistoryStore();
  const memoryStatus = [
    `History ${formatBytes(retainedBytes)} / ${formatBytes(HISTORY_POLICY.maxRetainedBytes)}`,
    droppedTransactions > 0 ? `${droppedTransactions} older step(s) trimmed` : null,
    overBudget ? 'latest step exceeds budget' : null,
  ].filter(Boolean).join(' · ');
  const undoTooltip = canUndo() ? `Undo: ${peekUndo()?.label} · ${memoryStatus}` : `Undo · ${memoryStatus}`;
  const redoTooltip = canRedo() ? `Redo: ${peekRedo()?.label} · ${memoryStatus}` : `Redo · ${memoryStatus}`;

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content={undoTooltip}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void applyUndo()} disabled={!canUndo()}>
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={redoTooltip}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void applyRedo()} disabled={!canRedo()}>
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />
    </div>
  );
};
