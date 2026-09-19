import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executeHeadlessPdfCommand,
  inspectHeadlessPdfDocument,
} from './headlessApi';

const mocks = vi.hoisted(() => ({
  hashBytes: vi.fn(),
  buildPageGraphFromPdfBytes: vi.fn(),
  executePageLabelCommandMutation: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    hashBytes: mocks.hashBytes,
  },
}));

vi.mock('@/core/pages/pageGraphAdmission', () => ({
  buildPageGraphFromPdfBytes: mocks.buildPageGraphFromPdfBytes,
}));

vi.mock('@/core/commands/pageLabelCommand', () => ({
  executePageLabelCommandMutation: mocks.executePageLabelCommandMutation,
}));

const PAGE_GRAPH = {
  pages: [
    {
      pageId: 'sha256:fixture::page::1',
      documentKey: 'sha256:fixture',
      originalPageNumber: 1,
      currentIndex: 0,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
    {
      pageId: 'sha256:fixture::page::2',
      documentKey: 'sha256:fixture',
      originalPageNumber: 2,
      currentIndex: 1,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
  ],
};

describe('headless canonical PDF command API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashBytes.mockResolvedValue('sha256:fixture');
    mocks.buildPageGraphFromPdfBytes.mockResolvedValue(PAGE_GRAPH);
    mocks.executePageLabelCommandMutation.mockResolvedValue({
      ok: true,
      bytes: new Uint8Array([9, 9]),
      pageGraph: PAGE_GRAPH,
    });
  });

  it('inspects exact source bytes to expose the PageIds required by API commands', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const inspection = await inspectHeadlessPdfDocument(bytes);

    expect(inspection).toEqual({
      documentKey: 'sha256:fixture',
      pageGraph: PAGE_GRAPH,
    });
    expect(mocks.hashBytes).toHaveBeenCalledWith(bytes);
    expect(mocks.buildPageGraphFromPdfBytes).toHaveBeenCalledWith(
      bytes,
      'sha256:fixture',
      undefined,
    );
  });

  it('executes the exact canonical SET_PAGE_LABELS draft against inspected PageIds', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const ranges = [
      {
        startPageId: 'sha256:fixture::page::1',
        style: 'decimal' as const,
      },
    ];

    await expect(
      executeHeadlessPdfCommand(
        bytes,
        {
          type: 'SET_PAGE_LABELS',
          payload: { ranges },
        },
      ),
    ).resolves.toEqual(new Uint8Array([9, 9]));

    expect(mocks.executePageLabelCommandMutation).toHaveBeenCalledWith(
      bytes,
      PAGE_GRAPH,
      ranges,
      undefined,
    );
  });

  it('rejects invalid canonical command payloads before PageLabels mutation', async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(
      executeHeadlessPdfCommand(
        bytes,
        {
          type: 'SET_PAGE_LABELS',
          payload: {
            ranges: [
              {
                startPageId: '',
                style: 'decimal',
              },
            ],
          },
        },
      ),
    ).rejects.toThrow(/Invalid headless PDF command/);

    expect(mocks.executePageLabelCommandMutation).not.toHaveBeenCalled();
  });

  it('surfaces PageId/domain validation errors from the shared mutation executor', async () => {
    mocks.executePageLabelCommandMutation.mockResolvedValueOnce({
      ok: false,
      errors: ['PageLabel range start does not exist: stale-page-id'],
    });

    await expect(
      executeHeadlessPdfCommand(
        new Uint8Array([1, 2, 3]),
        {
          type: 'SET_PAGE_LABELS',
          payload: {
            ranges: [{
              startPageId: 'stale-page-id',
              style: 'decimal',
            }],
          },
        },
      ),
    ).rejects.toThrow(/stale-page-id/);
  });
});
