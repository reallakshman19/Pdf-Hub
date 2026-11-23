import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { useSessionStore } from '@/core/session/store';
import { ThumbnailActionStrip } from './ThumbnailActionStrip';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mocks.execute,
  },
}));

vi.mock('@/core/pdf-mutation/pdfNormalization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/pdf-mutation/pdfNormalization')>();
  return {
    ...actual,
    normalizePdfPageDimensions: vi.fn().mockResolvedValue({
      normalizedBytes: new Uint8Array([1, 2, 3]),
      modifiedPageCount: 2,
      targetDimensions: { width: 595, height: 842 },
    }),
  };
});

describe('ThumbnailActionStrip header/footer migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().openDocument({
      documentKey: 'doc',
      fileName: 'report.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 4,
      pageGraph: {
        pages: [1, 2, 3, 4].map((pageNumber, index) => ({
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
      commandType: 'APPLY_HEADER_FOOTER_TEMPLATE',
      source: 'thumbnail-menu',
      mutated: true,
      message: 'Applied',
    });
  });

  afterEach(() => {
    cleanup();
    useSessionStore.getState().clearDocument();
  });

  it('targets selected stable PageIds for one-click page numbers', () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[2, 4]}
        currentPage={1}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Page numbers' }),
    );

    const input = mocks.execute.mock.calls[0]?.[0];
    expect(input.command).toMatchObject({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      source: 'thumbnail-menu',
      documentKey: 'doc',
      payload: {
        template: {
          rules: [
            {
              selector: {
                include: {
                  mode: 'pageIds',
                  pageIds: [
                    'doc::page::2',
                    'doc::page::4',
                  ],
                },
              },
              footer: {
                center: {
                  kind: 'text',
                  template:
                    'Page {{physicalPage}} of {{pageCount}}',
                },
              },
            },
          ],
        },
      },
    });
    expect(JSON.stringify(input.command)).not.toContain(
      'ADD_HEADER_FOOTER_TEXT',
    );
  });

  it('uses canonical fileName token for one-click headers', () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[]}
        currentPage={3}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Header file name' }),
    );

    const input = mocks.execute.mock.calls[0]?.[0];
    expect(input.command).toMatchObject({
      type: 'APPLY_HEADER_FOOTER_TEMPLATE',
      payload: {
        template: {
          rules: [
            {
              selector: {
                include: {
                  mode: 'pageIds',
                  pageIds: ['doc::page::3'],
                },
              },
              header: {
                right: {
                  kind: 'text',
                  template: '{{fileName}}',
                },
              },
            },
          ],
        },
      },
    });
  });

  it('opens ExtractPagesDialog and dispatches EXTRACT_PAGES when Extract is clicked and confirmed', async () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[2, 3]}
        currentPage={1}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Extract pages' }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Extract Pages' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /extract & download/i }));

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'EXTRACT_PAGES',
          payload: {
            pageIndices: [1, 2],
            outputName: 'report_extracted.pdf',
          },
        }),
      }),
    );
  });

  it('opens ExtractPagesDialog in split mode and dispatches SPLIT_PAGES when Split is clicked and confirmed', async () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[1]}
        currentPage={1}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Split pages' }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Split Document' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /split & download/i }));

    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({
          type: 'SPLIT_PAGES',
          payload: {
            pageIndices: [0],
            outputName: 'report_split.pdf',
          },
        }),
      }),
    );
  });

  it('opens PageLabelsDialog when Page labels button is clicked', async () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[1]}
        currentPage={1}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Page labels' }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Logical Page Labels')).toBeInTheDocument();
  });

  it('renders Collate and Normalize buttons and opens NormalizePageSizeDialog when clicked', async () => {
    render(
      <ThumbnailActionStrip
        selectedPages={[1, 2]}
        currentPage={1}
      />,
    );

    const collateBtn = screen.getByRole('button', { name: 'Collate with PDF' });
    const normalizeBtn = screen.getByRole('button', { name: 'Normalize page dimensions' });

    expect(collateBtn).toBeInTheDocument();
    expect(normalizeBtn).toBeInTheDocument();

    fireEvent.click(normalizeBtn);

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
});
