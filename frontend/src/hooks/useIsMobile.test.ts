import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './useIsMobile';

describe('useIsMobile', () => {
  let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
  const mockAddEventListener = vi.fn((type: string, handler: (e: MediaQueryListEvent) => void) => {
    if (type === 'change') {
      changeHandler = handler;
    }
  });
  const mockRemoveEventListener = vi.fn();

  beforeEach(() => {
    changeHandler = null;
    mockAddEventListener.mockClear();
    mockRemoveEventListener.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when viewport > 768px (matchMedia matches = false)', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal('matchMedia', matchMediaMock);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(matchMediaMock).toHaveBeenCalledWith('(max-width: 767.98px)');
  });

  it('returns true when viewport < 768px (matchMedia matches = true)', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal('matchMedia', matchMediaMock);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when matchMedia fires change event', () => {
    let currentMatches = false;
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return currentMatches;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal('matchMedia', matchMediaMock);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    expect(changeHandler).not.toBeNull();

    // Simulate window resizing to mobile width
    currentMatches = true;
    act(() => {
      if (changeHandler) {
        changeHandler({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(result.current).toBe(true);
  });

  it('cleanup removes listener on unmount', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: vi.fn(),
    }));

    vi.stubGlobal('matchMedia', matchMediaMock);

    const { unmount } = renderHook(() => useIsMobile());
    expect(mockRemoveEventListener).not.toHaveBeenCalled();

    unmount();
    expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
