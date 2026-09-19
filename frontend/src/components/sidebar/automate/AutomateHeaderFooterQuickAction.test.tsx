import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import { AutomateHeaderFooterQuickAction } from './AutomateHeaderFooterQuickAction';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  addToast: vi.fn(),
}));

const template: HeaderFooterTemplate = {
  schemaVersion: 1,
  name: 'Automate printed numbering',
  layout: {
    leftMarginPt: 36,
    rightMarginPt: 36,
    headerOffsetFromTopPt: 24,
    footerOffsetFromBottomPt: 24,
  },
  defaultTextStyle: {
    fontFamily: 'Helvetica',
    fontSizePt: 10,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#202020',
    opacity: 1,
  },
  rules: [
    {
      id: 'page-n',
      selector: { include: { mode: 'all' } },
      footer: {
        center: {
          kind: 'text',
          template: 'Page {{physicalPage}}',
        },
      },
    },
  ],
};

const logoBytes = new Uint8Array([7, 8, 9]);

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mocks.execute,
  },
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (
    selector: (state: { addToast: typeof mocks.addToast }) => unknown,
  ) => selector({ addToast: mocks.addToast }),
}));

vi.mock('@/components/dialogs/HeaderFooterDialog', () => ({
  HeaderFooterDialog: ({
    isOpen,
    onApply,
  }: {
    isOpen: boolean;
    onApply: (
      value: HeaderFooterTemplate,
      binaryResources?: Readonly<Record<string, Uint8Array>>,
    ) => Promise<boolean>;
  }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() =>
          void onApply(template, {
            logo: logoBytes,
          })
        }
      >
        Apply canonical template
      </button>
    ) : null,
}));

const pageGraph = {
  pages: [
    {
      pageId: 'doc::page::1',
      documentKey: 'doc',
      originalPageNumber: 1,
      currentIndex: 0,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
  ],
};

describe('AutomateHeaderFooterQuickAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({
      success: true,
      commandId: 'cmd-1',
      commandType: 'APPLY_HEADER_FOOTER_TEMPLATE',
      source: 'macro-runner',
      mutated: true,
      message: 'Header/footer template applied',
    });
  });

  it('executes the same canonical template command with out-of-band binaries', async () => {
    render(
      <AutomateHeaderFooterQuickAction
        disabled={false}
        documentKey="doc"
        fileName="report.pdf"
        pageGraph={pageGraph}
        currentPageId="doc::page::1"
        selectedPageIds={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Configure printed content',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Apply canonical template',
      }),
    );

    await waitFor(() => {
      expect(mocks.execute).toHaveBeenCalledTimes(1);
    });

    const input = mocks.execute.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      command: {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        source: 'macro-runner',
        documentKey: 'doc',
        payload: { template },
      },
      resources: {
        binaries: {
          logo: logoBytes,
        },
      },
    });
    expect(JSON.stringify(input.command)).not.toContain(
      JSON.stringify(Array.from(logoBytes)),
    );
  });

  it('reports canonical command failures without invoking a macro recipe', async () => {
    mocks.execute.mockResolvedValueOnce({
      success: false,
      commandId: 'cmd-2',
      commandType: 'APPLY_HEADER_FOOTER_TEMPLATE',
      source: 'macro-runner',
      mutated: false,
      message: 'Resource missing',
      error: {
        code: 'RESOURCE_MISSING',
        message: 'Logo resource missing',
      },
    });

    render(
      <AutomateHeaderFooterQuickAction
        disabled={false}
        documentKey="doc"
        fileName="report.pdf"
        pageGraph={pageGraph}
        currentPageId="doc::page::1"
        selectedPageIds={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Configure printed content',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Apply canonical template',
      }),
    );

    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Header & Footer Failed',
          message: 'Logo resource missing',
        }),
      );
    });
  });
});
