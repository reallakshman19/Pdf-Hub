import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { useSessionStore } from '@/core/session/store';
import { ThumbnailContextMenu } from './ThumbnailContextMenu';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  pickPdfFileSources: vi.fn(),
  admitDonorPdfFiles: vi.fn(),
  assertDispatchAllowed: vi.fn(),
  firstErrorMessage: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mocks.execute,
  },
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    pickPdfFileSources: mocks.pickPdfFileSources,
    savePdfBytes: vi.fn(),
  },
}));

vi.mock('@/core/admission/donorPdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/admission/donorPdf')>();
  return {
    ...actual,
    admitDonorPdfFiles: mocks.admitDonorPdfFiles,
    assertAdmittedDonorSetDispatchAllowed: mocks.assertDispatchAllowed,
    firstDonorAdmissionErrorMessage: mocks.firstErrorMessage,
  };
});

vi.mock('@/core/pdf-mutation/pdfNormalization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/pdf-mutation/pdfNormalization')>();
  return {
    ...actual,
    normalizePdfPageDimensions: vi.fn().mockResolvedValue({
      normalizedBytes: new Uint8Array([1, 2, 3]),
      modifiedPageCount: 1,
      targetDimensions: { width: 595, height: 842 },
    }),
  };
});

vi.mock('@/core/clipboard/pageClipboardStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/clipboard/pageClipboardStore')>();
  return {
    ...actual,
    serializeSelectedPagesToPdf: vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9])),
  };
});

vi.mock('@/core/thumbnails/quickPageExport', () => ({
  copyPageImageToClipboard: vi.fn().mockResolvedValue({ success: true, message: 'Copied image' }),
  downloadPageAsPng: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/pdf-annotations/flattenNativePdfAnnotations', () => ({
  flattenNativePdfAnnotations: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9])),
}));

vi.mock('@/core/pdf-mutation/pdfBatesNumbering', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/pdf-mutation/pdfBatesNumbering')>();
  return {
    ...actual,
    applyBatesNumbering: vi.fn().mockResolvedValue({
      modifiedBytes: new Uint8Array([5, 5, 5]),
      stampedPageCount: 1,
      sampleFirstStamp: 'BATES-0001',
    }),
  };
});

vi.mock('@/core/pdf-mutation/pdfMarginCropping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/pdf-mutation/pdfMarginCropping')>();
  return {
    ...actual,
    cropPdfMargins: vi.fn().mockResolvedValue({
      modifiedBytes: new Uint8Array([6, 6, 6]),
      croppedPageCount: 1,
    }),
  };
});

vi.mock('@/core/pdf-mutation/pdfSplitBundle', () => ({
  createSplitPagesZipBundle: vi.fn().mockResolvedValue({
    zipBytes: new Uint8Array([8, 8, 8]),
    fileCount: 2,
  }),
}));

describe('ThumbnailContextMenu PDF Insertion and Page Replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().openDocument({
      documentKey: 'doc',
      fileName: 'report.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 3,
      pageGraph: {
        pages: [1, 2, 3].map((pageNumber, index) => ({
          pageId: `doc::page::${pageNumber}`,
          documentKey: 'doc',
          originalPageNumber: pageNumber,
          currentIndex: index,
          width: 595,
          height: 842,
          rotation: 0 as const,
        })),
      },
    });
    mocks.execute.mockResolvedValue({
      success: true,
      commandId: 'cmd',
      commandType: 'INSERT_PAGES',
      source: 'thumbnail-menu',
      mutated: true,
      message: 'Complete',
    });
  });

  afterEach(() => {
    cleanup();
    useSessionStore.getState().clearDocument();
  });

  it('renders modern context actions and excludes the legacy (Donor p1) stub', () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Insert PDF Before...')).toBeInTheDocument();
    expect(screen.getByText('Insert PDF After...')).toBeInTheDocument();
    expect(screen.getByText('Replace Page from PDF...')).toBeInTheDocument();
    expect(screen.getByText('Collate Document with PDF...')).toBeInTheDocument();
    expect(screen.getByText('Normalize Page Dimensions...')).toBeInTheDocument();
    expect(screen.queryByText(/Donor p1/i)).not.toBeInTheDocument();
  });

  it('opens NormalizePageSizeDialog when Normalize Page Dimensions is clicked', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Normalize Page Dimensions...'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Normalize Page Dimensions')).toBeInTheDocument();
    });
  });

  it('disambiguates replace action label when multiple thumbnails are selected', () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[1, 2, 3]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Replace 3 Selected Pages with PDF...')).toBeInTheDocument();
    expect(screen.getByText('Replace Page 2 from PDF...')).toBeInTheDocument();
  });

  it('dispatches INSERT_PAGES before target page when Insert PDF Before is clicked', async () => {
    const fakeDonor = {
      donorDocumentKey: 'donor-1',
      fileName: 'imported.pdf',
      pageCount: 2,
      bytes: new Uint8Array([9, 8, 7]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'imported.pdf', size: 100 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [fakeDonor],
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Insert PDF Before...'));

    await waitFor(() => {
      expect(mocks.admitDonorPdfFiles).toHaveBeenCalledWith(
        expect.any(Array),
        'THUMBNAIL_CONTEXT_MENU',
        'INSERT_PAGES',
        expect.any(Object),
      );
    });

    // Verify dialog appears and confirm
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: {
              atIndex: 1, // before page 2 (index 1)
              donorResourceId: 'donor:0',
            },
          }),
        }),
      );
    });
  });

  it('dispatches INSERT_PAGES after target page when Insert PDF After is clicked', async () => {
    const fakeDonor = {
      donorDocumentKey: 'donor-1',
      fileName: 'imported.pdf',
      pageCount: 4,
      bytes: new Uint8Array([9, 8, 7]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'imported.pdf', size: 100 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [fakeDonor],
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Insert PDF After...'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: {
              atIndex: 2, // after page 2 (index 2)
              donorResourceId: 'donor:0',
            },
          }),
        }),
      );
    });
  });

  it('replaces immediately when donor PDF has exactly one page', async () => {
    const singlePageDonor = {
      donorDocumentKey: 'donor-single',
      fileName: 'single.pdf',
      pageCount: 1,
      bytes: new Uint8Array([5, 5, 5]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'single.pdf', size: 50 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [singlePageDonor],
        commandTarget: 'REPLACE_PAGE',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Replace Page from PDF...'));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'REPLACE_PAGE',
            payload: {
              atIndex: 1,
              donorResourceId: 'donor:0',
              donorPageIndex: 0,
            },
          }),
        }),
      );
    });
  });

  it('opens ReplacePageDialog when donor PDF has multiple pages', async () => {
    const multiPageDonor = {
      donorDocumentKey: 'donor-multi',
      fileName: 'multi.pdf',
      pageCount: 5,
      bytes: new Uint8Array([5, 5, 5, 5]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'multi.pdf', size: 200 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [multiPageDonor],
        commandTarget: 'REPLACE_PAGE',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Replace Page from PDF...'));

    // Verify dialog appears
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Replace Page')).toBeInTheDocument();
    });

    // Enter donor page 3 and confirm
    const pageInput = screen.getByRole('spinbutton');
    fireEvent.change(pageInput, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'REPLACE_PAGE',
            payload: {
              atIndex: 1,
              donorResourceId: 'donor:0',
              donorPageIndex: 2, // 3 - 1
            },
          }),
        }),
      );
    });
  });

  it('replaces multiple selected pages atomically with donor PDF pages', async () => {
    const fakeDonor = {
      donorDocumentKey: 'donor-multi',
      fileName: 'replacement.pdf',
      pageCount: 2,
      bytes: new Uint8Array([5, 5, 5]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'replacement.pdf', size: 150 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [fakeDonor],
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2, 3]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Replace 2 Selected Pages with PDF...'));

    await waitFor(() => {
      expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
      expect(screen.getByText('replacement.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    await waitFor(() => {
      // 1st call should insert donor pages at insertion index (index 1)
      expect(mocks.execute).toHaveBeenCalledWith(
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
      // 2nd call should delete original pages shifted by inserted donor count (2 + 1 = 3, 2 + 2 = 4)
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'DELETE_PAGES',
            payload: {
              pageIndices: [3, 4],
            },
          }),
        }),
      );
    });
  });

  it('safely replaces all pages in a document without total deletion validation error', async () => {
    const fakeDonor = {
      donorDocumentKey: 'donor-all',
      fileName: 'new_doc.pdf',
      pageCount: 1,
      bytes: new Uint8Array([1, 2, 3]),
    };
    mocks.pickPdfFileSources.mockResolvedValue([{ name: 'new_doc.pdf', size: 100 }]);
    mocks.admitDonorPdfFiles.mockResolvedValue({
      outcome: 'ACCEPTED',
      value: {
        donors: [fakeDonor],
        commandTarget: 'INSERT_PAGES',
        ownerDocumentKey: 'doc',
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1, 2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Replace 2 Selected Pages with PDF...'));

    await waitFor(() => {
      expect(screen.getByText('new_doc.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    await waitFor(() => {
      // 1st call inserts at index 0
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: expect.objectContaining({
              atIndex: 0,
            }),
          }),
        }),
      );
      // 2nd call deletes shifted [0+1, 1+1] = [1, 2]
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'DELETE_PAGES',
            payload: {
              pageIndices: [1, 2],
            },
          }),
        }),
      );
    });
  });

  it('opens NormalizePageSizeDialog and dispatches APPLY_WORKING_COPY when confirmed', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Normalize Page Dimensions...'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Normalize Page Dimensions')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('normalize-submit-button'));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'APPLY_WORKING_COPY',
            payload: expect.objectContaining({
              binaryResourceId: 'binary:normalized',
              reason: expect.stringContaining('Normalize page dimensions'),
            }),
          }),
        }),
      );
    });
  });

  it('dispatches ROTATE_PAGES with angle 90 (clockwise)', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Rotate 90° Clockwise'));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'ROTATE_PAGES',
          payload: { pageIndices: [1], angle: 90 },
        }),
      }),
    );
  });

  it('dispatches ROTATE_PAGES with angle 270 (counter-clockwise)', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Rotate 90° Counter-Clockwise'));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'ROTATE_PAGES',
          payload: { pageIndices: [1], angle: 270 },
        }),
      }),
    );
  });

  it('dispatches ROTATE_PAGES with angle 180 (flip)', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Rotate 180° (Flip)'));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'ROTATE_PAGES',
          payload: { pageIndices: [1], angle: 180 },
        }),
      }),
    );
  });

  it('copies and cuts pages into pageClipboardStore', async () => {
    const { usePageClipboardStore } = await import('@/core/clipboard/pageClipboardStore');
    usePageClipboardStore.getState().clearClipboard();

    const { unmount } = render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1, 2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Copy 2 Pages'));
    await waitFor(() => {
      const clip = usePageClipboardStore.getState().clipboard;
      expect(clip).not.toBeNull();
      expect(clip?.isCut).toBe(false);
      expect(clip?.pageIndices).toEqual([0, 1]);
    });

    unmount();
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={3}
        selectedPages={[3]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Cut Page'));
    await waitFor(() => {
      const clip = usePageClipboardStore.getState().clipboard;
      expect(clip).not.toBeNull();
      expect(clip?.isCut).toBe(true);
      expect(clip?.pageIndices).toEqual([2]);
    });
  });

  it('reverses order of selected pages using REORDER_PAGES_BY_ORDER', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1, 2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Reverse Selected Page Order'));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'REORDER_PAGES_BY_ORDER',
          payload: { order: [1, 0, 2] },
        }),
      }),
    );
  });

  it('pastes pages from clipboard before and after', async () => {
    const { usePageClipboardStore } = await import('@/core/clipboard/pageClipboardStore');
    usePageClipboardStore.getState().copyPages({
      sourceDocumentKey: 'doc',
      sourceFileName: 'report.pdf',
      pageIndices: [0],
      serializedPagesBytes: new Uint8Array([1, 2]),
    });

    mocks.admitDonorPdfFiles.mockResolvedValueOnce({
      outcome: 'ACCEPTED',
      value: {
        donors: [
          {
            donorId: 'donor-clip',
            fileName: 'clipboard.pdf',
            bytes: new Uint8Array([1, 2]),
            pageCount: 1,
          },
        ],
      },
    });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Paste 1 Page(s) Before')).toBeInTheDocument();
    expect(screen.getByText('Paste 1 Page(s) After')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Paste 1 Page(s) After'));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'INSERT_PAGES',
            payload: {
              atIndex: 2,
              donorResourceId: 'donor:clipboard',
            },
          }),
        }),
      );
    });
  });

  it('removes cut source pages after paste, and keeps the clipboard when that removal fails', async () => {
    const { usePageClipboardStore } = await import('@/core/clipboard/pageClipboardStore');
    const { useToastStore } = await import('@/core/toast/store');
    const acceptedDonor = {
      outcome: 'ACCEPTED',
      value: {
        donors: [{ donorId: 'donor-clip', fileName: 'clipboard.pdf', bytes: new Uint8Array([1, 2]), pageCount: 1 }],
      },
    };
    const cutPage = () => usePageClipboardStore.getState().cutPages({
      sourceDocumentKey: 'doc',
      sourceFileName: 'report.pdf',
      pageIndices: [2],
      serializedPagesBytes: new Uint8Array([1, 2]),
    });
    const renderMenu = () => render(
      <ThumbnailContextMenu x={100} y={100} page={1} selectedPages={[1]} onClose={vi.fn()} />,
    );

    // Success: paste before page 1 shifts the cut page (index 2) to index 3.
    cutPage();
    mocks.admitDonorPdfFiles.mockResolvedValueOnce(acceptedDonor);
    renderMenu();
    fireEvent.click(screen.getByText('Paste 1 Page(s) Before'));
    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
        command: expect.objectContaining({ type: 'DELETE_PAGES', payload: { pageIndices: [3] } }),
      }));
    });
    await waitFor(() => expect(usePageClipboardStore.getState().clipboard).toBeNull());
    cleanup();

    // Failure: the delete step fails, so the clipboard is retained and an error is surfaced.
    cutPage();
    mocks.admitDonorPdfFiles.mockResolvedValueOnce(acceptedDonor);
    mocks.execute
      .mockResolvedValueOnce({ success: true, commandId: 'ins', commandType: 'INSERT_PAGES', source: 'thumbnail-menu', mutated: true, message: 'ok' })
      .mockResolvedValueOnce({ success: false, commandId: 'del', commandType: 'DELETE_PAGES', source: 'thumbnail-menu', mutated: false, message: 'delete blocked' });
    renderMenu();
    fireEvent.click(screen.getByText('Paste 1 Page(s) Before'));
    await waitFor(() => {
      expect(useToastStore.getState().toasts.some((toast) => toast.title === 'Cut Source Not Removed')).toBe(true);
    });
    expect(usePageClipboardStore.getState().clipboard?.isCut).toBe(true);
  });

  it('triggers copy page image to clipboard and export as PNG', async () => {
    const { usePdfStore } = await import('@/core/session/pdfStore');
    const { copyPageImageToClipboard, downloadPageAsPng } = await import('@/core/thumbnails/quickPageExport');
    const mockDoc = {} as never;
    usePdfStore.setState({ pdfDoc: mockDoc });

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={2}
        selectedPages={[2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Copy Page Image to Clipboard'));
    await waitFor(() => {
      expect(copyPageImageToClipboard).toHaveBeenCalledWith(mockDoc, 2, 2.0);
    });

    fireEvent.click(screen.getByText('Export Page as PNG...'));
    await waitFor(() => {
      expect(downloadPageAsPng).toHaveBeenCalledWith(mockDoc, 2, 'report.pdf', 2.0);
    });
  });

  it('flattens annotations on document when clicked', async () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Flatten Annotations on Document...'));

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'APPLY_WORKING_COPY',
            payload: expect.objectContaining({
              binaryResourceId: 'binary:flattened',
              reason: 'Flatten annotations into page graphics',
            }),
          }),
        }),
      );
    });
  });

  it('flattens annotations selectively on selected pages when clicked', async () => {
    const { flattenNativePdfAnnotations } = await import('@/core/pdf-annotations/flattenNativePdfAnnotations');

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1, 2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Flatten Annotations on 2 Pages'));

    await waitFor(() => {
      expect(flattenNativePdfAnnotations).toHaveBeenCalledWith(expect.any(Uint8Array), [0, 1]);
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'APPLY_WORKING_COPY',
            payload: expect.objectContaining({
              binaryResourceId: 'binary:flattened',
              reason: expect.stringContaining('Flatten annotations on page(s) 1, 2'),
            }),
          }),
        }),
      );
    });
  });

  it('opens BatesNumberingDialog when Bates Numbering is clicked', () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Bates Numbering / Revision Stamp...'));
    expect(screen.getByText('Bates Numbering / Drawing Revision Stamping')).toBeInTheDocument();
  });

  it('opens CropMarginsDialog when Crop Page Margins is clicked', () => {
    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Crop Page Margins...'));
    expect(screen.getByText('Crop Page Margins / Trim Border Whitespace')).toBeInTheDocument();
  });

  it('calls cropPdfMargins and applies working copy when Auto-Trim White Margins is clicked', async () => {
    const { cropPdfMargins } = await import('@/core/pdf-mutation/pdfMarginCropping');

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Auto-Trim White Margins'));

    await waitFor(() => {
      expect(cropPdfMargins).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.objectContaining({
          mode: 'auto',
          pageIndices: [0],
        }),
      );
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'APPLY_WORKING_COPY',
            payload: expect.objectContaining({
              binaryResourceId: 'binary:cropped',
            }),
          }),
        }),
      );
    });
  });

  it('saves standalone extracted PDF when Quick Save is clicked', async () => {
    const { FileAdapter } = await import('@/adapters/file/FileAdapter');

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Quick Save Page 1 as PDF'));

    await waitFor(() => {
      expect(FileAdapter.savePdfBytes).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining('_p1.pdf'),
        null,
      );
    });
  });

  it('calls createSplitPagesZipBundle and saves zip when packageAsZip is confirmed in ExtractPagesDialog', async () => {
    const { createSplitPagesZipBundle } = await import('@/core/pdf-mutation/pdfSplitBundle');
    const { FileAdapter } = await import('@/adapters/file/FileAdapter');

    render(
      <ThumbnailContextMenu
        x={100}
        y={100}
        page={1}
        selectedPages={[1, 2]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Extract Pages...'));

    const zipCheckbox = screen.getByTestId('extract-zip-checkbox');
    fireEvent.click(zipCheckbox);

    fireEvent.click(screen.getByTestId('extract-submit-button'));

    await waitFor(() => {
      expect(createSplitPagesZipBundle).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        [0, 1],
        expect.stringContaining('.zip'),
      );
      expect(FileAdapter.savePdfBytes).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.stringContaining('.zip'),
        null,
      );
    });
  });
});
