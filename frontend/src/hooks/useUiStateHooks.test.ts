import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDarkMode } from './useDarkMode';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import { useSessionStore } from '@/core/session/store';

describe('useDarkMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads stored theme, updates html dark class, and toggles cleanly', () => {
    window.localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      result.current.toggleDarkMode();
    });
    expect(result.current.isDarkMode).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
  });
});

describe('useUnsavedChangesGuard', () => {
  it('calls preventDefault on beforeunload only when session is dirty', () => {
    useSessionStore.setState({ isDirty: false });
    const { unmount } = renderHook(() => useUnsavedChangesGuard());

    const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    act(() => {
      useSessionStore.setState({ isDirty: true });
    });
    const dirtyEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    unmount();
    useSessionStore.setState({ isDirty: false });
  });
});
