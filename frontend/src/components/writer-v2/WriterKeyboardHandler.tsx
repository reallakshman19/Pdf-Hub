import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  nudgeSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';

/**
 * Document-level Writer V2 keyboard shortcuts.
 * This component renders nothing.
 */
export const WriterKeyboardHandler: React.FC = () => {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const store = useWriterV2Store.getState();

      if (store.editingId !== null) {
        return;
      }

      const hasSelection = store.selectedIds.length > 0;
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? event.metaKey : event.ctrlKey;
      const step = event.shiftKey ? 10 : 1;

      if (hasSelection && isArrowKey(event.key)) {
        const delta = nudgeDelta(event.key, step);

        if (delta) {
          event.preventDefault();
          nudgeSelectedWriterElements(delta.dx, delta.dy);
          return;
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        deleteSelectedWriterElements();
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'd' && hasSelection) {
        event.preventDefault();
        duplicateSelectedWriterElements();
        return;
      }

      if (event.key === 'Escape' && hasSelection) {
        event.preventDefault();
        store.dispatchWriterCommand({
          type: 'CLEAR_WRITER_SELECTION',
        });
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undoWriter();
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        store.redoWriter();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return null;
};

function isArrowKey(key: string): boolean {
  return key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown';
}

/**
 * Writer rects use PDF coordinates, origin bottom-left.
 */
function nudgeDelta(
  key: string,
  step: number,
): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };

    case 'ArrowRight':
      return { dx: step, dy: 0 };

    case 'ArrowUp':
      return { dx: 0, dy: step };

    case 'ArrowDown':
      return { dx: 0, dy: -step };

    default:
      return null;
  }
}
