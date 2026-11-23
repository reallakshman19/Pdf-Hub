import type { ReactNode } from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DocumentWorkspace } from './DocumentWorkspace';
import '@/core/annotations/register-all';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { commandBus } from '@/core/commands/bus';
import { admitDonorPdfFiles } from '@/core/admission/donorPdf';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

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
  };
});

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    pickPdfFileSources: vi.fn(),
    pickPdfFiles: vi.fn(),
    hashBytes: vi.fn(),
  },
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => {
  const doc = {
    numPages: 3,
    destroy: vi.fn(),
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
      cleanup: vi.fn(),
    }),
  };

  return {
    PdfRendererAdapter: {
      acquireDocument: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'test-doc',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      acquireDocumentSource: vi.fn().mockResolvedValue({
        doc,
        cacheKey: 'test-doc',
        release: vi.fn().mockResolvedValue(undefined),
      }),
      renderPage: vi.fn(),
      getPageTextItems: vi.fn().mockResolvedValue([]),
      getThumbnail: vi.fn(),
    },
  };
});

vi.mock('virtua', () => ({
  VList: ({ children }: { children: ReactNode }) => <div data-testid="vlist">{children}</div>,
}));

describe('DocumentWorkspace drag-and-drop & shortcut insertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'test-doc-key',
      pageCount: 3,
      viewState: {
        currentPageId: null,
        currentPage: 2,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
      setZoom: vi.fn(),
    });
    useEditorStore.setState({ activeTool: 'select' });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      setTransform: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it('renders viewport drop overlay when dragging an external file over workspace and clears on drag leave', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const scrollContainer = document.getElementById('workspace-scroll-container');
    expect(scrollContainer).not.toBeNull();

    // Drag enter with Files
    fireEvent.dragEnter(scrollContainer!, {
      dataTransfer: {
        types: ['Files'],
      },
    });

    expect(screen.getByTestId('viewport-drop-overlay')).toBeInTheDocument();
    expect(screen.getByText('Drop PDF to insert into document')).toBeInTheDocument();
    expect(screen.getByText('Target: Page 2 of 3')).toBeInTheDocument();

    // Drag leave
    fireEvent.dragLeave(scrollContainer!, {
      dataTransfer: {
        types: ['Files'],
      },
    });

    expect(screen.queryByTestId('viewport-drop-overlay')).not.toBeInTheDocument();
  });

  it('admits dropped PDF file onto viewport, opens InsertPdfDialog, and dispatches INSERT_PAGES', async () => {
    const mockDonor = {
      inputIndex: 0,
      fileName: 'viewport_donor.pdf',
      sourceBytes: 2048,
      pageCount: 2,
      ownerDocumentKey: 'test-doc-key',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'DOCUMENT_VIEWPORT',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'test-doc-key',
        generation: 1,
        donors: [mockDonor as never],
        aggregateSourceBytes: 2048,
      },
    } as never);

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const scrollContainer = document.getElementById('workspace-scroll-container');
    const fakePdfFile = new File(['%PDF-1.4 viewport'], 'viewport_donor.pdf', {
      type: 'application/pdf',
    });

    await act(async () => {
      fireEvent.drop(scrollContainer!, {
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
      'DOCUMENT_VIEWPORT',
      'INSERT_PAGES',
      expect.anything(),
    );

    // Verify InsertPdfDialog renders
    await waitFor(() => {
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
      expect(screen.getByText('viewport_donor.pdf')).toBeInTheDocument();
    });

    // Confirm dialog
    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: expect.objectContaining({
              atIndex: 2, // after page 2
              donorResourceId: 'donor:0',
            }),
          }),
        }),
      );
    });
  });

  it('rejects non-PDF dropped files on viewport with a toast error', async () => {
    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const scrollContainer = document.getElementById('workspace-scroll-container');
    const fakeTextFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      fireEvent.drop(scrollContainer!, {
        dataTransfer: {
          types: ['Files'],
          files: [fakeTextFile],
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

  it('admits multiple dropped PDF files in batch and sequentially inserts all donors at current page', async () => {
    const donor1 = {
      inputIndex: 0,
      fileName: 'doc_a.pdf',
      sourceBytes: 1024,
      pageCount: 2,
      ownerDocumentKey: 'test-doc-key',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };
    const donor2 = {
      inputIndex: 1,
      fileName: 'doc_b.pdf',
      sourceBytes: 3072,
      pageCount: 1,
      ownerDocumentKey: 'test-doc-key',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'DOCUMENT_VIEWPORT',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'test-doc-key',
        generation: 2,
        donors: [donor1 as never, donor2 as never],
        aggregateSourceBytes: 4096,
      },
    } as never);

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    const scrollContainer = document.getElementById('workspace-scroll-container');
    const fileA = new File(['%PDF-1.4 a'], 'doc_a.pdf', { type: 'application/pdf' });
    const fileB = new File(['%PDF-1.4 b'], 'doc_b.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.drop(scrollContainer!, {
        dataTransfer: {
          types: ['Files'],
          files: [fileA, fileB],
        },
      });
    });

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: expect.objectContaining({
              atIndex: 2,
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
              atIndex: 4, // 2 + donor1.pageCount(2)
              donorResourceId: 'donor:1',
            }),
          }),
        }),
      );
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Batch PDFs Inserted',
          message: expect.stringContaining('Inserted 3 pages from 2 PDF files.'),
        }),
      );
    });
  });

  it('triggers donor selection and opens InsertPdfDialog when pressing Ctrl+Shift+I shortcut', async () => {
    const mockDonor = {
      inputIndex: 0,
      fileName: 'shortcut_donor.pdf',
      sourceBytes: 1024,
      pageCount: 3,
      ownerDocumentKey: 'test-doc-key',
      commandTarget: 'INSERT_PAGES' as const,
      handle: null,
    };

    vi.mocked(FileAdapter.pickPdfFileSources).mockResolvedValue([
      { name: 'shortcut_donor.pdf', size: 1024 } as never,
    ]);

    vi.mocked(admitDonorPdfFiles).mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        source: 'DOCUMENT_VIEWPORT',
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'test-doc-key',
        generation: 3,
        donors: [mockDonor as never],
        aggregateSourceBytes: 1024,
      },
    } as never);

    await act(async () => {
      render(<DocumentWorkspace />);
    });

    fireEvent.keyDown(window, {
      key: 'I',
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(FileAdapter.pickPdfFileSources).toHaveBeenCalledWith(false);
      expect(admitDonorPdfFiles).toHaveBeenCalledWith(
        expect.anything(),
        'DOCUMENT_VIEWPORT',
        'INSERT_PAGES',
        expect.anything(),
      );
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
      expect(screen.getByText('shortcut_donor.pdf')).toBeInTheDocument();
    });
  });
});
