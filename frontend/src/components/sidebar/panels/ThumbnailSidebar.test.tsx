import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  afterEach,
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

import ThumbnailSidebar from './ThumbnailSidebar';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSearchStore } from '@/core/search/store';
import {
  acquireScheduledThumbnail,
} from '@/core/renderer/thumbnailRenderService';

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

vi.mock('@/core/session/store', () => ({
  useSessionStore: vi.fn(),
}));

vi.mock('@/core/editor/store', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('@/core/annotations/store', () => ({
  useAnnotationStore: vi.fn(),
}));

vi.mock('@/core/search/store', () => ({
  useSearchStore: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: vi.fn().mockResolvedValue({
      success: true,
      mutated: true,
    }),
  },
}));

vi.mock(
  '@/core/renderer/thumbnailRenderService',
  () => ({
    acquireScheduledThumbnail: vi.fn(),
  }),
);

describe('ThumbnailSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    usePdfStore.setState({ pdfDoc: null });
  });

  it('renders scheduled thumbnails and handles keyboard navigation and selection', async () => {
    const mockSetPage = vi.fn();
    const mockSetSelectedPages = vi.fn();
    const mockToggleSelectedPage = vi.fn();
    const mockSetSidebarTab = vi.fn();

    const mockedUseSessionStore =
      useSessionStore as unknown as {
        mockReturnValue: (value: unknown) => void;
      };
    const mockedUseEditorStore =
      useEditorStore as unknown as {
        mockReturnValue: (value: unknown) => void;
      };
    const mockedUseAnnotationStore =
      useAnnotationStore as unknown as {
        mockReturnValue: (value: unknown) => void;
      };
    const mockedUseSearchStore =
      useSearchStore as unknown as {
        mockReturnValue: (value: unknown) => void;
      };

    mockedUseSessionStore.mockReturnValue({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sha256:thumbnail-doc',
      pageGraph: null,
      viewState: { currentPage: 1 },
      setPage: mockSetPage,
      selectedPages: [],
      setSelectedPages: mockSetSelectedPages,
      toggleSelectedPage: mockToggleSelectedPage,
    });
    mockedUseEditorStore.mockReturnValue({
      setSidebarTab: mockSetSidebarTab,
    });
    mockedUseAnnotationStore.mockReturnValue({
      annotations: [],
    });
    mockedUseSearchStore.mockReturnValue({
      hits: [],
    });

    const pageCleanup = vi.fn();
    const getPage = vi.fn().mockImplementation(
      async (pageNumber: number) => ({
        pageNumber,
        getViewport: vi.fn().mockReturnValue({
          width: 600,
          height: 800,
        }),
        cleanup: pageCleanup,
      } as unknown as PDFPageProxy),
    );
    const doc = {
      numPages: 2,
      getPage,
    } as unknown as PDFDocumentProxy;
    usePdfStore.setState({ pdfDoc: doc });

    const thumbnailRelease = vi.fn();
    vi.mocked(
      acquireScheduledThumbnail,
    ).mockResolvedValue({
      value: {
        imageUrl: 'data:image/jpeg;base64,thumb',
        pageWidth: 600,
        pageHeight: 800,
        estimatedDecodedBytes: 4,
        dispose: vi.fn(),
      },
      release: thumbnailRelease,
    });

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await vi.waitFor(() => {
      expect(
        screen.queryByText(
          /Generating thumbnails.../i,
        ),
      ).not.toBeInTheDocument();
    });

    const thumbnails =
      await screen.findAllByRole(
        'button',
        { name: /Page \d+/ },
        { timeout: 2000 },
      );
    expect(thumbnails).toHaveLength(2);
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(pageCleanup).toHaveBeenCalledTimes(2);

    await vi.waitFor(() => {
      expect(
        acquireScheduledThumbnail,
      ).toHaveBeenCalledTimes(2);
    });
    expect(
      acquireScheduledThumbnail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        doc,
        documentKey: 'sha256:thumbnail-doc',
        pageNumber: 1,
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      fireEvent.keyDown(
        thumbnails[0],
        { key: 'Enter' },
      );
    });
    expect(mockSetPage).toHaveBeenCalledWith(1);
    expect(
      mockSetSelectedPages,
    ).toHaveBeenCalledWith([1]);

    const nextThumb = thumbnails[1];
    const focus = vi.spyOn(
      nextThumb,
      'focus',
    ).mockImplementation(() => undefined);
    vi.spyOn(
      document,
      'getElementById',
    ).mockReturnValue(nextThumb);

    await act(async () => {
      fireEvent.keyDown(
        thumbnails[0],
        { key: 'ArrowDown' },
      );
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
