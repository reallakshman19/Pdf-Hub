import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('useKeyboardShortcuts - Keyboard Nudge & Page Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      viewState: {
        currentPageId: null,
        currentPage: 2,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'single',
      },
      pageCount: 10,
    });

    useAnnotationStore.setState({
      annotations: [
        {
          id: 'test-anno-1',
          type: 'textbox',
          pageNumber: 2,
          rect: { x: 50, y: 50, width: 60, height: 25 },
          data: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    });
  });

  it('navigates pages when NO annotations are selected', () => {
    renderHook(() => useKeyboardShortcuts());

    // ArrowRight advances page
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(useSessionStore.getState().viewState.currentPage).toBe(3);

    // ArrowLeft goes back
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);
  });

  it('nudges selected annotation by 1 pt on Arrow keys without changing page', () => {
    useAnnotationStore.setState({ selectedAnnotationIds: ['test-anno-1'] });
    renderHook(() => useKeyboardShortcuts());

    // ArrowRight nudges x by +1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    let anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.x).toBe(51);
    expect(anno?.rect.y).toBe(50);
    // Page did NOT change!
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);

    // ArrowDown nudges y by +1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.x).toBe(51);
    expect(anno?.rect.y).toBe(51);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);

    // ArrowLeft nudges x by -1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.x).toBe(50);
    expect(anno?.rect.y).toBe(51);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);

    // ArrowUp nudges y by -1
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.x).toBe(50);
    expect(anno?.rect.y).toBe(50);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);
  });

  it('nudges selected annotation by 10 pt on Shift + Arrow keys', () => {
    useAnnotationStore.setState({ selectedAnnotationIds: ['test-anno-1'] });
    renderHook(() => useKeyboardShortcuts());

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    let anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.x).toBe(60);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true }));
    anno = useAnnotationStore.getState().annotations.find((a) => a.id === 'test-anno-1');
    expect(anno?.rect.y).toBe(40);
    expect(useSessionStore.getState().viewState.currentPage).toBe(2);
  });
});
