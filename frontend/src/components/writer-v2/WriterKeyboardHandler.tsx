import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import {
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  nudgeSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';
import {
  copySelectedWriterElementsToClipboard,
  pasteWriterClipboardElements,
} from '@/core/writer-v2/writerClipboardActions';
import { isWriterKeyboardHandled, markWriterKeyboardHandled } from '@/core/writer-v2/writerKeyboardGuard';

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

      if (store.editingId !== null || isWriterKeyboardHandled(event)) {
        return;
      }

      const hasSelection = store.selectedIds.length > 0;
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? event.metaKey : event.ctrlKey;
      const step = event.shiftKey ? 10 : 1;

      if (event.key === 'Enter' && !ctrl && !event.altKey && store.selectedIds.length === 1) {
        const selectedEl = store.elements.find((el) => el.id === store.selectedIds[0]);
        if (selectedEl && !selectedEl.locked && selectedEl.type !== 'imageBox') {
          event.preventDefault();
          markWriterKeyboardHandled(event);
          store.beginEditingWriterElement(selectedEl.id);
          return;
        }
      }

      if (ctrl && event.key.toLowerCase() === 'c' && hasSelection) {
        event.preventDefault();
        markWriterKeyboardHandled(event);
        copySelectedWriterElementsToClipboard();
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        markWriterKeyboardHandled(event);
        void pasteWriterClipboardElements()
          .then((result) => {
            if (!result.changed) {
              // Fail-closed copy rejection must be visible for keyboard paste,
              // even when there is no selected object / quick-action toolbar.
              useSessionStore.getState().failSaveOperation(result.message);
            }
          })
          .catch((error: unknown) => {
            useSessionStore.getState().failSaveOperation(
              error instanceof Error ? error.message : String(error),
            );
          });
        return;
      }

      if (hasSelection && isArrowKey(event.key)) {
        const delta = nudgeDelta(event.key, step);

        if (delta) {
          event.preventDefault();
          markWriterKeyboardHandled(event);
          void nudgeSelectedWriterElements(delta.dx, delta.dy);
          return;
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        markWriterKeyboardHandled(event);
        void deleteSelectedWriterElements();
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'd' && hasSelection) {
        event.preventDefault();
        markWriterKeyboardHandled(event);
        void duplicateSelectedWriterElements();
        return;
      }

      if (event.key === 'Escape' && hasSelection) {
        event.preventDefault();
        markWriterKeyboardHandled(event);
        store.dispatchWriterCommand({
          type: 'CLEAR_WRITER_SELECTION',
        });
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (store.documentMeta?.mode !== 'blankDocument') return;
        event.preventDefault();
        event.stopPropagation();
        store.undoWriter();
        return;
      }

      if (ctrl && event.key.toLowerCase() === 'z' && event.shiftKey) {
        if (store.documentMeta?.mode !== 'blankDocument') return;
        event.preventDefault();
        event.stopPropagation();
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
