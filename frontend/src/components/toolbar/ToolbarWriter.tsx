import React from 'react';
import { Button } from '@/components/ui/Button';
import { Undo, Redo } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useShallow } from 'zustand/react/shallow';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export const ToolbarWriter: React.FC = () => {
  const { undoStack, redoStack } = useHistoryStore(useShallow((state) => ({
    undoStack: state.undoStack,
    redoStack: state.redoStack,
  })));
  const {
    documentMeta,
    localUndoStack,
    localRedoStack,
    undoWriter,
    redoWriter,
  } = useWriterV2Store(useShallow((state) => ({
    documentMeta: state.documentMeta,
    localUndoStack: state.undoStack,
    localRedoStack: state.redoStack,
    undoWriter: state.undoWriter,
    redoWriter: state.redoWriter,
  })));

  const useLocalHistory = documentMeta?.mode === 'blankDocument';
  const canUndo = useLocalHistory ? localUndoStack.length > 0 : undoStack.length > 0;
  const canRedo = useLocalHistory ? localRedoStack.length > 0 : redoStack.length > 0;

  return (
    <div className="flex items-center space-x-1">
      <Tooltip content="Undo (Ctrl+Z)">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (useLocalHistory) undoWriter();
            else void applyUndo();
          }}
          disabled={!canUndo}
        >
          <Undo className="w-4 h-4" />
        </Button>
      </Tooltip>
      <Tooltip content="Redo (Ctrl+Shift+Z)">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (useLocalHistory) redoWriter();
            else void applyRedo();
          }}
          disabled={!canRedo}
        >
          <Redo className="w-4 h-4" />
        </Button>
      </Tooltip>
    </div>
  );
};
