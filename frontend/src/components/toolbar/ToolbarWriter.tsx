import React from 'react';
import { Button } from '@/components/ui/Button';
import { Undo, Redo } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export const ToolbarWriter: React.FC = () => {
  const undoStack = useWriterV2Store((state) => state.undoStack);
  const redoStack = useWriterV2Store((state) => state.redoStack);
  const undoWriter = useWriterV2Store((state) => state.undoWriter);
  const redoWriter = useWriterV2Store((state) => state.redoWriter);

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content="Undo (Ctrl+Z)">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => undoWriter()}
          disabled={undoStack.length === 0}
        >
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Redo (Ctrl+Shift+Z)">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => redoWriter()}
          disabled={redoStack.length === 0}
        >
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>
    </div>
  );
};
