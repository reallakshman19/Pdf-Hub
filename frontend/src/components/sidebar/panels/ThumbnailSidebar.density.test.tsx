import {
  act,
  cleanup,
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

import ThumbnailSidebar, { DENSITY_HEIGHTS } from './ThumbnailSidebar';
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
    documentKey: 'sha256:density-doc',
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 3,
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
  fileName?: string;
  pageGraph: { pages: MockPageNode[] } | null;
  pageCount: number;
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

describe('ThumbnailSidebar Density Controls & Review Heat-Strip (Phase 7)', () => {
  let sessionState: MockSessionState;

  const setupTestEnvironment = async (customAnnotations: unknown[] = []) => {
    const mockedUseSessionStore = useSessionStore as unknown as {
      mockReturnValue: (value: unknown) => void;
      mockImplementation: (fn: (selector?: (state: unknown) => unknown) => unknown) => void;
    };
    const mockedUseEditorStore = useEditorStore as unknown as {
      mockReturnValue: (value: unknown) => void;
      mockImplementation: (fn: (selector?: (state: unknown) => unknown) => unknown) => void;
    };
    const mockedUseAnnotationStore = useAnnotationStore as unknown as {
      mockReturnValue: (value: unknown) => void;
      mockImplementation: (fn: (selector?: (state: unknown) => unknown) => unknown) => void;
    };
    const mockedUseSearchStore = useSearchStore as unknown as {
      mockReturnValue: (value: unknown) => void;
      mockImplementation: (fn: (selector?: (state: unknown) => unknown) => unknown) => void;
    };

    sessionState = {
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sha256:density-doc',
      fileName: 'density_test.pdf',
      pageCount: 3,
      pageGraph: {
        pages: [
          {
            pageId: 'p1',
            currentIndex: 0,
            originalPageNumber: 1,
            documentKey: 'sha256:density-doc',
            width: 612,
            height: 792,
            rotation: 0,
          },
          {
            pageId: 'p2',
            currentIndex: 1,
            originalPageNumber: 2,
            documentKey: 'sha256:density-doc',
            width: 612,
            height: 792,
            rotation: 0,
          },
          {
            pageId: 'p3',
            currentIndex: 2,
            originalPageNumber: 3,
            documentKey: 'sha256:density-doc',
            width: 612,
            height: 792,
            rotation: 0,
          },
        ],
      },
      viewState: { currentPage: 1, currentPageId: 'p1', zoom: 1, fitMode: 'page', viewMode: 'single' },
      setPage: vi.fn(),
      selectedPages: [1],
      setSelectedPages: vi.fn(),
      toggleSelectedPage: vi.fn(),
    };

    mockedUseSessionStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      return typeof selector === 'function' ? selector(sessionState) : sessionState;
    });
    (useSessionStore as unknown as { getState: () => unknown }).getState = () => sessionState;

    mockedUseEditorStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = { setSidebarTab: vi.fn() };
      return typeof selector === 'function' ? selector(state) : state;
    });

    mockedUseAnnotationStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = { annotations: customAnnotations };
      return typeof selector === 'function' ? selector(state) : state;
    });

    mockedUseSearchStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = { hits: [] };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const getPage = vi.fn().mockImplementation(
      async (pageNumber: number) => ({
        pageNumber,
        getViewport: vi.fn().mockReturnValue({
          width: 612,
          height: 792,
        }),
        cleanup: vi.fn(),
      } as unknown as PDFPageProxy),
    );

    const mockDoc = {
      numPages: 3,
      getPage,
    } as unknown as PDFDocumentProxy;

    usePdfStore.setState({ pdfDoc: mockDoc });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    usePdfStore.setState({ pdfDoc: null });
  });

  it('renders density buttons C, M, D and toggles thumbnail container heights', async () => {
    await setupTestEnvironment();
    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeInTheDocument();
      expect(screen.getByTestId('density-compact')).toBeInTheDocument();
      expect(screen.getByTestId('density-comfortable')).toBeInTheDocument();
      expect(screen.getByTestId('density-detailed')).toBeInTheDocument();
    });

    // Default is comfortable (135px)
    expect(screen.getByTestId('density-comfortable')).toHaveClass('text-blue-600');

    // Click Compact (C)
    fireEvent.click(screen.getByTestId('density-compact'));
    expect(screen.getByTestId('density-compact')).toHaveClass('text-blue-600');
    expect(screen.getByTestId('density-comfortable')).not.toHaveClass('text-blue-600');

    // Check thumbnail image container height for page 1
    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).toBeInTheDocument();
    const imageContainer = thumb1?.querySelector('.relative.bg-white') as HTMLElement;
    expect(imageContainer).toBeInTheDocument();
    expect(imageContainer.style.height).toBe(`${DENSITY_HEIGHTS.compact}px`);

    // Click Detailed (D)
    fireEvent.click(screen.getByTestId('density-detailed'));
    expect(screen.getByTestId('density-detailed')).toHaveClass('text-blue-600');
    expect(imageContainer.style.height).toBe(`${DENSITY_HEIGHTS.detailed}px`);

    // Click back to Comfortable (M)
    fireEvent.click(screen.getByTestId('density-comfortable'));
    expect(screen.getByTestId('density-comfortable')).toHaveClass('text-blue-600');
    expect(imageContainer.style.height).toBe(`${DENSITY_HEIGHTS.comfortable}px`);
  });

  it('renders rose heat-strip margin and badge for rejected review', async () => {
    await setupTestEnvironment([
      {
        id: 'ann-rejected',
        pageNumber: 2,
        type: 'highlight',
        rect: { x: 10, y: 10, width: 50, height: 20 },
        createdAt: 1000,
        data: {
          review: {
            status: 'rejected',
            author: 'Alice',
            createdAt: 1000,
            updatedAt: 1000,
            replies: [],
          },
        },
      },
    ]);

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Page 2')).toBeInTheDocument();
    });

    const page2Card = document.getElementById('thumbnail-2');
    expect(page2Card).toHaveClass('border-l-rose-500');

    const heatStrips = screen.getAllByTestId('review-heat-strip');
    expect(heatStrips.length).toBe(1);
    expect(heatStrips[0]).toHaveClass('bg-rose-500');

    // Also verify Rejected count badge
    expect(screen.getByText('Rejected 1')).toBeInTheDocument();
  });

  it('renders amber heat-strip margin for open review and no heat-strip for resolved review', async () => {
    await setupTestEnvironment([
      {
        id: 'ann-open',
        pageNumber: 1,
        type: 'comment',
        rect: { x: 10, y: 10, width: 50, height: 20 },
        createdAt: 1000,
        data: {
          review: {
            status: 'open',
            author: 'Bob',
            createdAt: 1000,
            updatedAt: 1000,
            replies: [],
          },
        },
      },
      {
        id: 'ann-resolved',
        pageNumber: 3,
        type: 'highlight',
        rect: { x: 20, y: 20, width: 60, height: 25 },
        createdAt: 1000,
        data: {
          review: {
            status: 'resolved',
            author: 'Charlie',
            createdAt: 1000,
            updatedAt: 1000,
            replies: [],
          },
        },
      },
    ]);

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeInTheDocument();
      expect(screen.getByText('Page 3')).toBeInTheDocument();
    });

    // Page 1 has open review -> amber
    const page1Card = document.getElementById('thumbnail-1');
    expect(page1Card).toHaveClass('border-l-amber-500');

    // Page 3 has resolved review -> transparent border, no heat strip
    const page3Card = document.getElementById('thumbnail-3');
    expect(page3Card).toHaveClass('border-l-transparent');

    const heatStrips = screen.getAllByTestId('review-heat-strip');
    expect(heatStrips.length).toBe(1);
    expect(heatStrips[0]).toHaveClass('bg-amber-500');
  });
});
