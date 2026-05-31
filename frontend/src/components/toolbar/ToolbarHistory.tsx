import React from 'react';
import { Button } from '@/components/ui/Button';
import { Undo, Redo } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useHistoryStore } from '@/core/document-history/store';
import { applyUndo, applyRedo } from '@/core/document-history/transactions';

export const ToolbarHistory: React.FC = () => {
  const { canUndo, canRedo, peekUndo, peekRedo } = useHistoryStore();

  const undoTooltip = canUndo() ? `Undo: ${peekUndo()?.label}` : 'Undo';
  const redoTooltip = canRedo() ? `Redo: ${peekRedo()?.label}` : 'Redo';

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content={undoTooltip}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={applyUndo} disabled={!canUndo()}>
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>

      <Tooltip content={redoTooltip}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={applyRedo} disabled={!canRedo()}>
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />
    </div>
  );
};
