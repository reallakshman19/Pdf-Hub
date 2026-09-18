import { describe, test, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import PageOperationPreview from '../../../pages/PageOperationPreview';

// Import the real session store to test selection logic in isolation
import { useSessionStore } from '@/core/session/store';

describe('Organize mode — page selection store behavior', () => {
  beforeEach(() => {
    useSessionStore.setState({
      selectedPageIds: [],
      selectedPages: [],
      pageCount: 5,
      pageGraph: null,
    });
  });

  test('setSelectedPages replaces selection', () => {
    const { setSelectedPages } = useSessionStore.getState();
    setSelectedPages([1, 3]);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 3]);
  });

  test('toggleSelectedPage adds page when not selected', () => {
    const { toggleSelectedPage } = useSessionStore.getState();
    toggleSelectedPage(2);
    expect(useSessionStore.getState().selectedPages).toContain(2);
  });

  test('toggleSelectedPage removes page when already selected', () => {
    useSessionStore.setState({ selectedPageIds: [], selectedPages: [2, 4] });
    const { toggleSelectedPage } = useSessionStore.getState();
    toggleSelectedPage(2);
    expect(useSessionStore.getState().selectedPages).not.toContain(2);
    expect(useSessionStore.getState().selectedPages).toContain(4);
  });

  test('clearSelectedPages empties the selection', () => {
    useSessionStore.setState({ selectedPageIds: [], selectedPages: [1, 2, 3] });
    const { clearSelectedPages } = useSessionStore.getState();
    clearSelectedPages();
    expect(useSessionStore.getState().selectedPages).toHaveLength(0);
  });

  test('selecting a range [1..3] produces pages 1, 2, 3', () => {
    const { setSelectedPages } = useSessionStore.getState();
    // Simulate what ThumbnailSidebar does on shift-click: inclusive range from 1 to 3
    const from = 1;
    const to = 3;
    const range: number[] = [];
    const step = from <= to ? 1 : -1;
    for (let p = from; p !== to + step; p += step) range.push(p);
    setSelectedPages(range);
    expect(useSessionStore.getState().selectedPages).toEqual([1, 2, 3]);
  });
});

describe('Organize mode — PageOperationPreview component', () => {
  test('renders without crashing (currently returns null)', () => {
    const { container } = render(<PageOperationPreview />);
    // Component is a placeholder returning null — verify it mounts cleanly
    expect(container.firstChild).toBeNull();
  });
});
