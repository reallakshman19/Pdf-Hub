import React from 'react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  alignSelectedWriterElements,
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  distributeSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  sendSelectedWriterElementToBack,
  toggleLockSelectedWriterElements,
  type WriterAlignMode,
  type WriterDistributeMode,
  type WriterSelectionActionResult,
} from '@/core/writer-v2/writerSelectionActions';

export const WriterSelectionQuickActions: React.FC = () => {
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const elements = useWriterV2Store((state) => state.elements);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);
  const selectedCount = selectedIds.length;
  const editableCount = React.useMemo(() => {
    const ids = new Set(selectedIds);
    return elements.filter((element) => ids.has(element.id) && !element.locked && !element.hidden).length;
  }, [elements, selectedIds]);

  if (selectedCount === 0) {
    return null;
  }

  const run = (result: WriterSelectionActionResult) => {
    if (result.changed) {
      completeSaveOperation(result.message);
    } else {
      failSaveOperation(result.message);
    }
  };

  const align = (mode: WriterAlignMode) => run(alignSelectedWriterElements(mode));
  const distribute = (mode: WriterDistributeMode) => run(distributeSelectedWriterElements(mode));

  return (
    <div
      aria-label="Writer selection quick actions"
      data-testid="writer-selection-quick-actions"
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/80 px-1 py-0.5 dark:border-slate-800 dark:bg-slate-950/80"
    >
      <span
        data-testid="writer-selection-count"
        className="px-1 text-xs text-slate-500 dark:text-slate-400"
      >
        {selectedCount} selected
      </span>

      <QuickAction label="Duplicate" title="Duplicate selected Writer elements" onClick={() => run(duplicateSelectedWriterElements())} />
      <QuickAction label="Remove" title="Remove selected Writer elements" onClick={() => run(deleteSelectedWriterElements())} />
      <QuickAction label="Lock" title="Lock or unlock selected Writer elements" onClick={() => run(toggleLockSelectedWriterElements())} />
      <QuickAction label="Hide" title="Hide selected Writer elements" onClick={() => run(hideSelectedWriterElements())} />
      <QuickAction label="Front" title="Bring active Writer element to front" onClick={() => run(bringSelectedWriterElementToFront())} />
      <QuickAction label="Back" title="Send active Writer element to back" onClick={() => run(sendSelectedWriterElementToBack())} />

      {editableCount >= 2 ? (
        <>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
          <QuickAction label="L" title="Align left" onClick={() => align('left')} />
          <QuickAction label="C" title="Align center" onClick={() => align('center')} />
          <QuickAction label="R" title="Align right" onClick={() => align('right')} />
          <QuickAction label="T" title="Align top" onClick={() => align('top')} />
          <QuickAction label="M" title="Align middle" onClick={() => align('middle')} />
          <QuickAction label="B" title="Align bottom" onClick={() => align('bottom')} />
        </>
      ) : null}

      {editableCount >= 3 ? (
        <>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
          <QuickAction label="Dist H" title="Distribute horizontally" onClick={() => distribute('horizontal')} />
          <QuickAction label="Dist V" title="Distribute vertically" onClick={() => distribute('vertical')} />
        </>
      ) : null}
    </div>
  );
};

interface QuickActionProps {
  label: string;
  title: string;
  onClick: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ label, title, onClick }) => (
  <Tooltip content={title}>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="h-7 px-2 text-xs"
    >
      {label}
    </Button>
  </Tooltip>
);
