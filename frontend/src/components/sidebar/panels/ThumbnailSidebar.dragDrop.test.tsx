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

import ThumbnailSidebar from './ThumbnailSidebar';
import { useSessionStore } from '@/core/session/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSearchStore } from '@/core/search/store';
import { commandBus } from '@/core/commands/bus';
import {
  admitDonorPdfFiles,
  DONOR_AGGREGATE_POLICY_AUTHORITY,
} from '@/core/admission/donorPdf';
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

vi.mock('@/core/session/store', () => {
  const fn = vi.fn();
  (fn as unknown as { getState: unknown }).getState = () => ({
    documentKey: 'sha256:drag-doc',
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

vi.mock('@/core/admission/donorPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/admission/donorPdf')>();
  return {
    ...actual,
    admitDonorPdfFiles: vi.fn(),
    assertAdmittedDonorSetDispatchAllowed: vi.fn(),
  };
});

vi.mock(
  '@/core/renderer/thumbnailRenderService',
  () => ({
    acquireScheduledThumbnail: vi.fn(),
  }),
);

describe('ThumbnailSidebar external file drag-and-drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    usePdfStore.setState({ pdfDoc: null });
  });

  const setupTestEnvironment = async () => {
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
      documentKey: 'sha256:drag-doc',
      pageGraph: null,
      viewState: { currentPage: 1 },
      setPage: vi.fn(),
      selectedPages: [1],
      setSelectedPages: vi.fn(),
      toggleSelectedPage: vi.fn(),
    });
    mockedUseEditorStore.mockReturnValue({
      setSidebarTab: vi.fn(),
    });
    mockedUseAnnotationStore.mockReturnValue({
      annotations: [],
    });
    mockedUseSearchStore.mockReturnValue({
      hits: [],
    });

    const getPage = vi.fn().mockImplementation(
      async (pageNumber: number) => ({
        pageNumber,
        getViewport: vi.fn().mockReturnValue({
          width: 600,
          height: 800,
        }),
        cleanup: vi.fn(),
      } as unknown as PDFPageProxy),
    );
    const doc = {
      numPages: 2,
      getPage,
    } as unknown as PDFDocumentProxy;
    usePdfStore.setState({ pdfDoc: doc });

    vi.mocked(acquireScheduledThumbnail).mockResolvedValue({
      value: {
        imageUrl: 'data:image/jpeg;base64,thumb',
        pageWidth: 600,
        pageHeight: 800,
        estimatedDecodedBytes: 4,
        dispose: vi.fn(),
      },
      release: vi.fn(),
    });

    await act(async () => {
      render(<ThumbnailSidebar />);
    });

    await waitFor(() => {
      expect(screen.getByText('Page 1')).toBeInTheDocument();
      expect(screen.getByText('Page 2')).toBeInTheDocument();
    });
  };

  it('shows drop indicator line before thumbnail when dragging file over top half', async () => {
    await setupTestEnvironment();

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).not.toBeNull();

    // Mock getBoundingClientRect for thumb1
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    // Drag over top half: clientY = 150 (midpoint is 200)
    fireEvent.dragOver(thumb1!, {
      clientY: 150,
      dataTransfer: {
        types: ['Files'],
      },
    });

    const indicator = screen.getByTestId('drop-indicator-line');
    expect(indicator).toBeInTheDocument();
  });

  it('shows drop indicator line after thumbnail when dragging file over bottom half', async () => {
    await setupTestEnvironment();

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).not.toBeNull();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    // Drag over bottom half: clientY = 250 (midpoint is 200)
    fireEvent.dragOver(thumb1!, {
      clientY: 250,
      dataTransfer: {
        types: ['Files'],
      },
    });

    const indicator = screen.getByTestId('drop-indicator-line');
    expect(indicator).toBeInTheDocument();
  });

  it('admits dropped PDF file and opens InsertPdfDialog, then dispatches INSERT_PAGES on confirm', async () => {
    await setupTestEnvironment();

    const mockDonor = {
      inputIndex: 0,
      fileName: 'inserted_donor.pdf',
      sourceBytes: 2048,
      pageCount: 3,
      ownerDocumentKey: 'sha256:drag-doc',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'THUMBNAIL_DRAG_DROP',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'sha256:drag-doc',
        generation: 1,
        donors: [mockDonor as never],
        aggregateSourceBytes: 2048,
      },
      evidence: {
        profileId: 'DONOR_PDF',
        policyVersion: '1.0',
        authority: DONOR_AGGREGATE_POLICY_AUTHORITY,
        measurements: [],
        diagnostics: [],
        commandTarget: 'INSERT_PAGES',
        aggregateAuthority: DONOR_AGGREGATE_POLICY_AUTHORITY,
        aggregateSourceBytes: 2048,
        inputs: [],
      },
    });

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).not.toBeNull();

    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    // Hover over top half to set placement = 'before'
    fireEvent.dragOver(thumb1!, {
      clientY: 150,
      dataTransfer: { types: ['Files'] },
    });

    const fakePdfFile = new File(['%PDF-1.4 test'], 'inserted_donor.pdf', {
      type: 'application/pdf',
    });

    // Drop the file
    const dropEvent = createEvent.drop(thumb1!, {
      dataTransfer: {
        types: ['Files'],
        files: [fakePdfFile],
      },
    });
    Object.defineProperty(dropEvent, 'clientY', { value: 150 });

    await act(async () => {
      fireEvent(thumb1!, dropEvent);
    });

    expect(admitDonorPdfFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ file: fakePdfFile }),
      ]),
      'THUMBNAIL_DRAG_DROP',
      'INSERT_PAGES',
      expect.any(Object),
    );

    // Dialog should now be open
    await waitFor(() => {
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
      expect(screen.getByText('inserted_donor.pdf')).toBeInTheDocument();
      expect(screen.getByText('3 total pages available')).toBeInTheDocument();
    });

    // Click Insert Pages in the modal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));
    });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'INSERT_PAGES',
          payload: expect.objectContaining({
            atIndex: 0, // 'before' page 1 -> atIndex = 0
            donorResourceId: 'donor:0',
          }),
        }),
        resources: {
          donors: {
            'donor:0': mockDonor,
          },
        },
      }),
    );
  });

  it('rejects non-PDF dropped files with a toast warning without opening modal', async () => {
    await setupTestEnvironment();

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).not.toBeNull();

    const fakeImageFile = new File(['image bytes'], 'image.png', {
      type: 'image/png',
    });

    await act(async () => {
      fireEvent.drop(thumb1!, {
        dataTransfer: {
          types: ['Files'],
          files: [fakeImageFile],
        },
      });
    });

    expect(admitDonorPdfFiles).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Unsupported File',
        message: expect.stringContaining('Please drop a valid PDF file'),
      }),
    );
    expect(screen.queryByText('Insert Pages from PDF')).not.toBeInTheDocument();
  });

  it('admits multiple dropped PDF files in batch and sequentially inserts all donors without omission', async () => {
    await setupTestEnvironment();

    const thumb1 = document.getElementById('thumbnail-1');
    expect(thumb1).not.toBeNull();

    const donorA = {
      inputIndex: 0,
      fileName: 'doc1.pdf',
      sourceBytes: 1024,
      pageCount: 2,
      ownerDocumentKey: 'sha256:drag-doc',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };
    const donorB = {
      inputIndex: 1,
      fileName: 'doc2.pdf',
      sourceBytes: 2048,
      pageCount: 3,
      ownerDocumentKey: 'sha256:drag-doc',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'THUMBNAIL_DRAG_DROP',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'sha256:drag-doc',
        generation: 3,
        donors: [donorA as never, donorB as never],
        aggregateSourceBytes: 3072,
      },
    } as never);

    const pdfFile1 = new File(['%PDF-1.4 doc1'], 'doc1.pdf', { type: 'application/pdf' });
    const pdfFile2 = new File(['%PDF-1.4 doc2'], 'doc2.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.drop(thumb1!, {
        dataTransfer: {
          types: ['Files'],
          files: [pdfFile1, pdfFile2],
        },
      });
    });

    expect(admitDonorPdfFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ file: pdfFile1 }),
        expect.objectContaining({ file: pdfFile2 }),
      ]),
      'THUMBNAIL_DRAG_DROP',
      'INSERT_PAGES',
      expect.anything(),
    );

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: expect.objectContaining({
              atIndex: 1,
              donorResourceId: 'donor:0',
            }),
          }),
        }),
      );
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: expect.objectContaining({
              atIndex: 3,
              donorResourceId: 'donor:1',
            }),
          }),
        }),
      );
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Batch PDFs Inserted',
          message: expect.stringContaining('Inserted 5 pages from 2 PDF files.'),
        }),
      );
    });
  });

  it('admits dropped PDF file on bottom dropzone and stages append after last page', async () => {
    await setupTestEnvironment();

    const bottomDropzone = screen.getByTestId('thumbnail-bottom-dropzone');
    expect(bottomDropzone).toBeInTheDocument();

    const mockDonor = {
      inputIndex: 0,
      fileName: 'appended_donor.pdf',
      sourceBytes: 1024,
      pageCount: 2,
      ownerDocumentKey: 'sha256:drag-doc',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'THUMBNAIL_DRAG_DROP',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'sha256:drag-doc',
        generation: 2,
        donors: [mockDonor as never],
        aggregateSourceBytes: 1024,
      },
    } as never);

    const fakePdfFile = new File(['%PDF-1.4 append'], 'appended_donor.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      fireEvent.drop(bottomDropzone, {
        dataTransfer: {
          types: ['Files'],
          files: [fakePdfFile],
        },
      });
    });

    expect(admitDonorPdfFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ file: fakePdfFile }),
      ]),
      'THUMBNAIL_DRAG_DROP',
      'INSERT_PAGES',
      expect.any(Object),
    );

    await waitFor(() => {
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
      expect(screen.getByText('appended_donor.pdf')).toBeInTheDocument();
    });
  });
});
