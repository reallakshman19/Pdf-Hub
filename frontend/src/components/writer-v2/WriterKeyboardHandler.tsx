import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';

/**
 * Mounts a document-level keydown listener for Writer V2 keyboard shortcuts.
 * Renders nothing — purely a side-effect component.
 */
export const WriterKeyboardHandler: React.FC = () => {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      // Do not intercept when focus is inside an input, textarea, or contenteditable
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? event.metaKey : event.ctrlKey;

      const store = useWriterV2Store.getState();

      // Do not intercept any key when the popup editor is open — the popup
      // has its own capture-phase document listener that takes priority.
      if (store.editingId !== null) return;
      const hasSelection = store.selectedIds.length > 0;

      // Delete / Backspace — delete selected elements
      if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        deleteSelectedWriterElements();
        return;
      }

      // Ctrl+D / Cmd+D — duplicate selected elements
      if (ctrl && event.key === 'd' && hasSelection) {
        event.preventDefault();
        duplicateSelectedWriterElements();
        return;
      }

      // Escape — clear selection
      if (event.key === 'Escape' && hasSelection) {
        event.preventDefault();
        store.dispatchWriterCommand({ type: 'CLEAR_WRITER_SELECTION' });
        return;
      }

      // Ctrl+Z / Cmd+Z — undo
      if (ctrl && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undoWriter();
        return;
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z — redo
      if (ctrl && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        store.redoWriter();
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return null;
};
