import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/core/session/store';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import { ToolbarOrganize } from './ToolbarOrganize';

const commandMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

const template: HeaderFooterTemplate = {
  schemaVersion: 1,
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
      id: 'logo',
      selector: { include: { mode: 'all' } },
      header: {
        left: {
          kind: 'image',
          binaryResourceId: 'header-footer-image:logo',
          widthPt: 48,
          fit: 'contain',
        },
      },
    },
  ],
};

const logoBytes = new Uint8Array([7, 8, 9]);

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: commandMocks.execute,
  },
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (
    selector: (state: { addToast: typeof toastMocks.addToast }) => unknown,
  ) => selector({ addToast: toastMocks.addToast }),
}));

vi.mock('@/core/document-history/store', () => ({
  useHistoryStore: () => ({
    canUndo: () => false,
    canRedo: () => false,
    peekUndo: () => null,
    peekRedo: () => null,
  }),
}));

vi.mock('@/core/document-history/transactions', () => ({
  applyUndo: vi.fn(),
  applyRedo: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    getPageSize: vi.fn(),
  },
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({
    content,
    children,
  }: {
    content: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-tooltip={typeof content === 'string' ? content : 'dynamic'}>
      {children}
    </div>
  ),
}));

vi.mock('../dialogs/InsertBlankPageDialog', () => ({
  InsertBlankPageDialog: () => null,
}));

vi.mock('../dialogs/ReplacePageDialog', () => ({
  ReplacePageDialog: () => null,
}));

vi.mock('../dialogs/PageLabelsDialog', () => ({
  PageLabelsDialog: () => null,
}));

vi.mock('../dialogs/HeaderFooterDialog', () => ({
  HeaderFooterDialog: ({
    isOpen,
    onApply,
  }: {
    isOpen: boolean;
    onApply: (
      template: HeaderFooterTemplate,
      binaryResources?: Readonly<Record<string, Uint8Array>>,
    ) => Promise<boolean>;
  }) =>
    isOpen ? (
      <button
        onClick={() =>
          void onApply(template, {
            'header-footer-image:logo': logoBytes,
          })
        }
      >
        Apply Mock Header Footer
      </button>
    ) : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.getState().openDocument({
    documentKey: 'doc-1',
    fileName: 'active.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 2,
    pageGraph: {
      pages: [
        {
          pageId: 'p1',
          documentKey: 'doc-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        },
        {
          pageId: 'p2',
          documentKey: 'doc-1',
          originalPageNumber: 2,
          currentIndex: 1,
          width: 595,
          height: 842,
          rotation: 0,
        },
      ],
    },
  });
  commandMocks.execute.mockResolvedValue({
    success: true,
    commandId: 'cmd-1',
    commandType: 'APPLY_HEADER_FOOTER_TEMPLATE',
    source: 'toolbar',
    mutated: true,
    message: 'Applied',
  });
});

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearDocument();
});

describe('ToolbarOrganize header/footer resources', () => {
  it('keeps image bytes out of the command and supplies them via CommandResources', async () => {
    render(<ToolbarOrganize />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Header & Footer' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Apply Mock Header Footer',
      }),
    );

    await waitFor(() => {
      expect(commandMocks.execute).toHaveBeenCalledTimes(1);
    });

    const executionInput = commandMocks.execute.mock.calls[0]?.[0];
    expect(executionInput).toMatchObject({
      command: {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        source: 'toolbar',
        documentKey: 'doc-1',
        payload: {
          template,
        },
      },
      resources: {
        binaries: {
          'header-footer-image:logo': logoBytes,
        },
      },
    });
    expect(JSON.stringify(executionInput.command)).not.toContain(
      JSON.stringify(Array.from(logoBytes)),
    );
  });
});
