import React from 'react';
import { Button } from '@/components/ui/Button';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  sendSelectedWriterElementToBack,
  toggleLockSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';

export const WriterV2Inspector: React.FC = () => {
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const selected = elements.find((element) => element.id === activeId)
    ?? elements.find((element) => selectedIds.includes(element.id))
    ?? null;

  if (!selected) {
    return (
      <div
        data-writer-v2-inspector="empty"
        className="flex items-center text-xs text-slate-500 px-2"
      >
        Writer V2: no selection
      </div>
    );
  }

  return (
    <div
      data-writer-v2-inspector="active"
      aria-label="Writer V2 inspector"
      className="flex items-center gap-1 text-xs"
    >
      <span
        className="px-2 py-1 rounded bg-slate-100 text-slate-700"
        title={selected.id}
      >
        {selected.type} · p{selected.pageIndex + 1} · {Math.round(selected.rect.width)}
        ×{Math.round(selected.rect.height)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => duplicateSelectedWriterElements()}
        title="Duplicate selected Writer V2 object"
      >
        Duplicate
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => toggleLockSelectedWriterElements()}
        title="Lock or unlock selected Writer V2 object"
      >
        {selected.locked ? 'Unlock' : 'Lock'}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => bringSelectedWriterElementToFront()}
        title="Bring selected Writer V2 object to front"
      >
        Front
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => sendSelectedWriterElementToBack()}
        title="Send selected Writer V2 object to back"
      >
        Back
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => hideSelectedWriterElements()}
        title="Hide selected Writer V2 object"
      >
        Hide
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={() => deleteSelectedWriterElements()}
        title="Delete selected Writer V2 object"
      >
        Delete
      </Button>
    </div>
  );
};