import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useEditorStore } from '@/core/editor/store';
import { useSearchStore } from '@/core/search/store';
import { useSessionStore } from '@/core/session/store';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('useKeyboardShortcuts - Search Shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'single',
      },
      pageCount: 5,
    });

    useSearchStore.setState({
      query: 'pipe',
      hits: [
        { id: 'hit-1', pageNumber: 1, snippet: 'pipe 1', rects: [] },
        { id: 'hit-2', pageNumber: 2, snippet: 'pipe 2', rects: [] },
      ],
      activeHitId: 'hit-1',
      isOverlayVisible: true,
    });
  });

  it('cycles next hit on F3 and previous hit on Shift+F3', () => {
    renderHook(() => useKeyboardShortcuts());

    // F3 -> next hit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3' }));
    expect(useSearchStore.getState().activeHitId).toBe('hit-2');

    // Shift + F3 -> prev hit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', shiftKey: true }));
    expect(useSearchStore.getState().activeHitId).toBe('hit-1');
  });

  it('cycles next hit on Ctrl+G and previous hit on Shift+Ctrl+G', () => {
    renderHook(() => useKeyboardShortcuts());

    // Ctrl+G -> next hit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    expect(useSearchStore.getState().activeHitId).toBe('hit-2');

    // Shift + Ctrl + G -> prev hit
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, shiftKey: true }));
    expect(useSearchStore.getState().activeHitId).toBe('hit-1');
  });

  it('clears active search query on Escape', () => {
    renderHook(() => useKeyboardShortcuts());

    expect(useSearchStore.getState().query).toBe('pipe');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().hits).toEqual([]);
  });

  it('dispatches pdf-hub:print on Ctrl+P', () => {
    renderHook(() => useKeyboardShortcuts());
    const listener = vi.fn();
    document.addEventListener('pdf-hub:print', listener);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));

    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener('pdf-hub:print', listener);
  });

  it('opens Automate panel and Macro Builder drawer on Ctrl+M', () => {
    useEditorStore.setState({
      activeMode: 'view',
      sidebarTab: 'thumbnails',
      leftPanelWidth: 0,
      macroBuilderOpen: false,
    });
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true }));

    const state = useEditorStore.getState();
    expect(state.activeMode).toBe('generate');
    expect(state.sidebarTab).toBe('macros');
    expect(state.leftPanelWidth).toBe(20);
    expect(state.macroBuilderOpen).toBe(true);
  });
});
