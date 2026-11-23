import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useHistoryStore } from '@/core/document-history/store';
import { applyRedo, applyUndo } from '@/core/document-history/transactions';
import { isDebugRouteEnabled } from '@/core/debug/availability';
import { resetInteractionState } from '@/core/editor/resetInteraction';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSearchStore } from '@/core/search/store';
import { useShallow } from 'zustand/react/shallow';

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { setZoom, setViewMode, setPage, viewState, pageCount } = useSessionStore(useShallow((state) => ({
    setZoom: state.setZoom,
    setViewMode: state.setViewMode,
    setPage: state.setPage,
    viewState: state.viewState,
    pageCount: state.pageCount,
  })));
  const {
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    clearSelection,
    nudgeSelectedAnnotations,
  } = useAnnotationStore(useShallow((state) => ({
    copySelection: state.copySelection,
    pasteClipboard: state.pasteClipboard,
    duplicateSelection: state.duplicateSelection,
    deleteSelection: state.deleteSelection,
    clearSelection: state.clearSelection,
    nudgeSelectedAnnotations: state.nudgeSelectedAnnotations,
  })));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      const zoomSteps = [25, 50, 75, 100, 125, 150, 200, 300, 400];

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        const enabled = isDebugRouteEnabled(window.location.hostname);
        if (enabled) {
          event.preventDefault();
          navigate('/debug');
        }
        if (enabled) return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        if (isTypingTarget) return;
        event.preventDefault();
        const writer = useWriterV2Store.getState();
        if (writer.documentMeta?.mode === 'blankDocument') {
          writer.undoWriter();
        } else if (useHistoryStore.getState().canUndo()) {
          void applyUndo();
        }
        return;
      }

      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y')
      ) {
        if (isTypingTarget) return;
        event.preventDefault();
        const writer = useWriterV2Store.getState();
        if (writer.documentMeta?.mode === 'blankDocument') {
          writer.redoWriter();
        } else if (useHistoryStore.getState().canRedo()) {
          void applyRedo();
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

      if (event.key === 'F3') {
        event.preventDefault();
        if (event.shiftKey) {
          useSearchStore.getState().prevHit();
        } else {
          useSearchStore.getState().nextHit();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          useSearchStore.getState().prevHit();
        } else {
          useSearchStore.getState().nextHit();
        }
        return;
      }

      if (!isTypingTarget && event.key === 'Escape') {
        if (useSearchStore.getState().query) {
          useSearchStore.getState().clearSearch();
        }
        resetInteractionState();
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

      // Keyboard nudge for selected annotations:
      // When annotations are selected, Arrow keys nudge by 1 pt (or 10 pt with Shift)
      // and do NOT trigger page navigation.
      const hasAnnotationSelection =
        useAnnotationStore.getState().selectedAnnotationIds.length > 0 ||
        Boolean(useAnnotationStore.getState().activeAnnotationId);

      if (
        !isTypingTarget &&
        hasAnnotationSelection &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowUp') dy = -step;
        if (event.key === 'ArrowDown') dy = step;
        if (event.key === 'ArrowLeft') dx = -step;
        if (event.key === 'ArrowRight') dx = step;
        nudgeSelectedAnnotations(dx, dy);
        return;
      }

      if (!isTypingTarget && event.key === 'ArrowRight') {
        event.preventDefault();
        const current = useSessionStore.getState().viewState.currentPage;
        setPage(Math.min(pageCount, current + 1));
        return;
      }

      if (!isTypingTarget && event.key === 'ArrowLeft') {
        event.preventDefault();
        const current = useSessionStore.getState().viewState.currentPage;
        setPage(Math.max(1, current - 1));
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
    nudgeSelectedAnnotations,
  ]);
};
