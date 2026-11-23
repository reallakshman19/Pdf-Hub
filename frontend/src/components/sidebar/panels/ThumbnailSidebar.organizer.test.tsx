import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ReactNode } from 'react';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist';

import ThumbnailSidebar, { formatPageDimensions } from './ThumbnailSidebar';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSearchStore } from '@/core/search/store';

vi.mock('virtua', () => ({
  VList: ({
    children,
    data,
  }: {
    children: (item: { pageNumber: number }) => ReactNode;
    data: Array<{ pageNumber: number }>;
  }) => (
    <div data-testid="vlist">
      {data?.map((item) => (
        <div key={item.pageNumber}>
          {children(item)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/core/session/store', () => {
  const fn = vi.fn();
  (fn as unknown as { getState: () => unknown }).getState = () => ({
    documentKey: 'sha256:organizer-doc',
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 2,
    viewState: { currentPage: 1 },
  });
  return { useSessionStore: fn };
});

vi.mock('@/core/editor/store', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('@/core/annotations/store', () => ({
  useAnnotationStore: vi.fn(),
}));

vi.mock('@/core/search/store', () => ({
  useSearchStore: vi.fn(),
}));

const mockAddToast = vi.fn();

vi.mock('@/core/toast/store', () => {
  const store = Object.assign(
    (selector?: (state: unknown) => unknown) => {
      const state = { addToast: mockAddToast, toasts: [] };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({ addToast: mockAddToast, toasts: [] }),
    },
  );
  return { useToastStore: store };
});

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: vi.fn().mockResolvedValue({
      success: true,
      mutated: true,
    }),
  },
}));

vi.mock('@/core/renderer/thumbnailRenderService', () => ({
  acquireScheduledThumbnail: vi.fn().mockResolvedValue({
    release: vi.fn(),
    value: { imageUrl: 'blob:test-thumbnail-url' },
  }),
}));

interface MockPageNode {
  pageId: string;
  currentIndex: number;
  originalPageNumber: number;
  documentKey: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

interface MockSessionState {
  workingBytes: Uint8Array | null;
  documentKey: string;
  pageGraph: { pages: MockPageNode[] } | null;
  viewState: {
    currentPage: number;
    currentPageId: string | null;
    zoom: number;
    fitMode: string;
    viewMode: string;
  };
  setPage: ((page: number) => void) | ReturnType<typeof vi.fn>;
  selectedPages: number[];
  setSelectedPages: ((pages: number[]) => void) | ReturnType<typeof vi.fn>;
  toggleSelectedPage: ((page: number) => void) | ReturnType<typeof vi.fn>;
}

describe('ThumbnailSidebar Organizer Features (Phase 6)', () => {
  let sessionState: MockSessionState;
  let mockSetSelectedPages: ReturnType<typeof vi.fn>;
  let mockToggleSelectedPage: ReturnType<typeof vi.fn>;
  let mockSetPage: ReturnType<typeof vi.fn>;

  const setupTestEnvironment = async (customState: Partial<MockSessionState> = {}) => {
    const mockedUseSessionStore = useSessionStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseEditorStore = useEditorStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseAnnotationStore = useAnnotationStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    const mockedUseSearchStore = useSearchStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };

    mockSetSelectedPages = vi.fn((pages: number[]) => {
      sessionState.selectedPages = pages;
    });
    mockToggleSelectedPage = vi.fn();
    mockSetPage = vi.fn();

    sessionState = {
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sha256:organizer-doc',
      pageGraph: {
        pages: [
          {
            pageId: 'p1',
            currentIndex: 0,
            originalPageNumber: 1,
            documentKey: 'sha256:organizer-doc',
            width: 612,
            height: 792,
            rotation: 0,
          },
          {
            pageId: 'p2',
            currentIndex: 1,
            originalPageNumber: 2,
            documentKey: 'sha256:organizer-doc',
            width: 595,
            height: 842,
            rotation: 90,
          },
        ],
      },
      viewState: { currentPage: 1, currentPageId: 'p1', zoom: 1, fitMode: 'page', viewMode: 'single' },
      setPage: mockSetPage,
      selectedPages: [1],
      setSelectedPages: mockSetSelectedPages,
      toggleSelectedPage: mockToggleSelectedPage,
      ...customState,
    };

    mockedUseSessionStore.mockReturnValue(sessionState);
    (useSessionStore as unknown as { getState: () => unknown }).getState = () => sessionState;

    mockedUseEditorStore.mockReturnValue({
      setSidebarTab: vi.fn(),
    });

    mockedUseAnnotationStore.mockReturnValue({
      annotations: [
        {
          id: 'ann-1',
          pageNumber: 1,
          type: 'highlight',
          rect: { x: 10, y: 10, width: 50, height: 20 },
          createdAt: Date.now(),
          data: {
            review: { status: 'open', replies: [] },
          },
        },
      ],
    });

    mockedUseSearchStore.mockReturnValue({
      hits: [{ pageNumber: 2, matchIndex: 0, text: 'test query' }],
    });

    const getPage = vi.fn().mockImplementation(
      async (pageNumber: number) => ({
        pageNumber,
        getViewport: vi.fn().mockReturnValue({
          width: pageNumber === 1 ? 612 : 595,
          height: pageNumber === 1 ? 792 : 842,
        }),
        cleanup: vi.fn(),
      } as unknown as PDFPageProxy),
    );
    const doc = {
      numPages: 2,
      getPage,
    } as unknown as PDFDocumentProxy;
    usePdfStore.setState({ pdfDoc: doc });

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeInTheDocument();
      expect(screen.getByText('Page 2')).toBeInTheDocument();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    usePdfStore.setState({ pdfDoc: null });
  });

  it('formats standard paper dimensions correctly', () => {
    expect(formatPageDimensions(612, 792)).toBe('Letter');
    expect(formatPageDimensions(595, 842)).toBe('A4');
    expect(formatPageDimensions(612, 1008)).toBe('Legal');
    expect(formatPageDimensions(842, 1191)).toBe('A3');
    expect(formatPageDimensions(792, 1224)).toBe('Tabloid');
    expect(formatPageDimensions(400, 500)).toBe('400 × 500 pt');
    expect(formatPageDimensions(0, 0)).toBe('');
  });

  it('renders filter bar pills with computed counts and metadata badges', async () => {
    await setupTestEnvironment();

    expect(screen.getByTestId('thumbnail-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-all')).toHaveTextContent('All (2)');
    expect(screen.getByTestId('filter-pill-annotations')).toHaveTextContent('Annotated (1)');
    expect(screen.getByTestId('filter-pill-reviews')).toHaveTextContent('Reviewed (1)');
    expect(screen.getByTestId('filter-pill-search')).toHaveTextContent('Search (1)');

    // Dimension badges
    const dimensionBadges = screen.getAllByTestId('page-dimension-badge');
    expect(dimensionBadges).toHaveLength(2);
    expect(dimensionBadges[0]).toHaveTextContent('Letter');
    expect(dimensionBadges[1]).toHaveTextContent('A4');

    // Rotation badge on page 2 only (rotation = 90)
    const rotationBadges = screen.getAllByTestId('page-rotation-badge');
    expect(rotationBadges).toHaveLength(1);
    expect(rotationBadges[0]).toHaveTextContent('90°');
  });

  it('filters thumbnails by annotations and resets to all', async () => {
    await setupTestEnvironment();

    // Click "Annotated" filter pill
    fireEvent.click(screen.getByTestId('filter-pill-annotations'));

    // Status banner appears
    expect(screen.getByTestId('filter-status-banner')).toHaveTextContent('Showing 1 of 2 pages');
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.queryByText('Page 2')).not.toBeInTheDocument();

    // Click Reset button
    fireEvent.click(screen.getByTestId('filter-reset-button'));

    // Both pages restored
    expect(screen.queryByTestId('filter-status-banner')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('filters thumbnails by search hits', async () => {
    await setupTestEnvironment();

    // Click "Search" filter pill
    fireEvent.click(screen.getByTestId('filter-pill-search'));

    // Status banner shows 1 of 2 pages
    expect(screen.getByTestId('filter-status-banner')).toHaveTextContent('Showing 1 of 2 pages');
    expect(screen.queryByText('Page 1')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('shows empty filter state when no pages match and allows resetting', async () => {
    const mockedUseAnnotationStore = useAnnotationStore as unknown as {
      mockReturnValue: (value: unknown) => void;
    };
    await setupTestEnvironment();

    // Override annotations with resolved only so unresolved count is 0
    mockedUseAnnotationStore.mockReturnValue({
      annotations: [
        {
          id: 'ann-resolved',
          pageNumber: 1,
          type: 'highlight',
          rect: { x: 10, y: 10, width: 50, height: 20 },
          createdAt: Date.now(),
          data: {
            review: { status: 'resolved', replies: [] },
          },
        },
      ],
    });

    // Re-render or trigger filter click
    fireEvent.click(screen.getByTestId('filter-pill-reviews'));

    expect(screen.getByTestId('no-filtered-pages-message')).toHaveTextContent('No pages match the active filter.');

    // Click "Show all pages" inside empty state
    fireEvent.click(screen.getByText('Show all pages'));

    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('prevents internal page reordering while filter is active', async () => {
    await setupTestEnvironment();

    // Activate annotations filter
    fireEvent.click(screen.getByTestId('filter-pill-annotations'));

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).toBeInTheDocument();

    // Attempt to drag thumb1
    const dragEvent = createEvent.dragStart(thumb1!);
    fireEvent(thumb1!, dragEvent);

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: 'Reorder Disabled',
        message: 'Clear page filter to reorder pages.',
      }),
    );
  });

  it('attaches multi-page drag ghost badge when dragging multiple selected pages', async () => {
    await setupTestEnvironment({ selectedPages: [1, 2] });

    const thumb1 = document.getElementById('thumbnail-1');
    const mockSetDragImage = vi.fn();
    const dataTransfer = {
      types: ['text/plain'],
      setData: vi.fn(),
      setDragImage: mockSetDragImage,
    };

    const dragEvent = createEvent.dragStart(thumb1!);
    Object.defineProperty(dragEvent, 'dataTransfer', {
      value: dataTransfer,
    });

    fireEvent(thumb1!, dragEvent);

    expect(mockSetDragImage).toHaveBeenCalledTimes(1);
    const ghostElement = mockSetDragImage.mock.calls[0][0] as HTMLElement;
    expect(ghostElement).toHaveAttribute('data-testid', 'drag-ghost-chip');
    expect(ghostElement.textContent).toContain('Moving 2 pages');
  });

  it('navigates between filtered thumbnails via arrow keys', async () => {
    await setupTestEnvironment();

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).toBeInTheDocument();

    const thumb2 = document.getElementById('thumbnail-2');
    expect(thumb2).toBeInTheDocument();

    const focusSpy = vi.spyOn(thumb2!, 'focus');

    // Arrow down from thumb1
    fireEvent.keyDown(thumb1!, { key: 'ArrowDown' });
    expect(focusSpy).toHaveBeenCalled();
  });

  it('restricts shift range selection to visible filtered pages', async () => {
    await setupTestEnvironment({ selectedPages: [1] });

    // Filter by annotations (only page 1 matches)
    fireEvent.click(screen.getByTestId('filter-pill-annotations'));

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).toBeInTheDocument();

    // Shift click thumb1
    fireEvent.click(thumb1!, { shiftKey: true });
    expect(mockSetSelectedPages).toHaveBeenCalledWith([1]);
  });
});
