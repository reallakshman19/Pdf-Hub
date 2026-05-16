import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { isDebugRouteEnabled } from '@/core/debug/availability';

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { setZoom, setViewMode, setPage, viewState, pageCount } = useSessionStore();
  const {
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    clearSelection,
    undo,
    redo,
  } = useAnnotationStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        const enabled = isDebugRouteEnabled(window.location.hostname, import.meta.env.DEV);
        if (enabled) {
          event.preventDefault();
          navigate('/debug');
        }
        if (enabled) return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (useHistoryStore.getState().canUndo()) {
          applyUndo();
        } else {
          undo();
        }
        return;
      }

      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y')
      ) {
        event.preventDefault();
        if (useHistoryStore.getState().canRedo()) {
          applyRedo();
        } else {
          redo();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        const nextZoom = zoomSteps.find((step) => step > useSessionStore.getState().viewState.zoom) || 400;
        setZoom(nextZoom);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        const currentZoom = useSessionStore.getState().viewState.zoom;
        const nextZoom = zoomSteps.slice().reverse().find((step) => step < currentZoom) || 25;
        setZoom(nextZoom);
        return;
      }

      if (!isTypingTarget && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (!isTypingTarget && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboard(useSessionStore.getState().viewState.currentPage);
        return;
      }

      if (!isTypingTarget && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }

      if (!isTypingTarget && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (!isTypingTarget && event.key === 'Escape') {
        clearSelection();
        return;
      }

      if (!isTypingTarget && event.altKey && event.key === '1') {
        event.preventDefault();
        setViewMode('continuous');
        return;
      }

      if (!isTypingTarget && event.altKey && event.key === '2') {
        event.preventDefault();
        setViewMode('single');
        return;
      }

      if (!isTypingTarget && event.altKey && event.key === '3') {
        event.preventDefault();
        setViewMode('two-page');
        return;
      }

      if (!isTypingTarget && event.key === 'ArrowRight') {
        event.preventDefault();
        setPage(Math.min(pageCount, viewState.currentPage + 1));
        return;
      }

      if (!isTypingTarget && event.key === 'ArrowLeft') {
        event.preventDefault();
        setPage(Math.max(1, viewState.currentPage - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    navigate,
    setZoom,
    setViewMode,
    setPage,
    viewState.currentPage,
    pageCount,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    clearSelection,
    undo,
    redo,
  ]);
};
