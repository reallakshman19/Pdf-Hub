import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
