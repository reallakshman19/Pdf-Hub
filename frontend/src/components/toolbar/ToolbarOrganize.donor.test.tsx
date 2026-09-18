import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmittedDonorPdf, AdmittedDonorSet } from '@/core/admission/donorPdf';
import { useSessionStore } from '@/core/session/store';
import { ToolbarOrganize } from './ToolbarOrganize';

const fileMocks = vi.hoisted(() => ({
  pickPdfFileSources: vi.fn(),
  pickPdfFiles: vi.fn(),
  savePdfBytes: vi.fn(),
}));

const admissionMocks = vi.hoisted(() => ({
  admitDonorPdfFiles: vi.fn(),
  assertDispatchAllowed: vi.fn(),
  firstErrorMessage: vi.fn(),
}));

const commandMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  addToast: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    pickPdfFileSources: fileMocks.pickPdfFileSources,
    pickPdfFiles: fileMocks.pickPdfFiles,
    savePdfBytes: fileMocks.savePdfBytes,
  },
}));

vi.mock('@/core/admission/donorPdf', () => ({
  admitDonorPdfFiles: admissionMocks.admitDonorPdfFiles,
  assertAdmittedDonorSetDispatchAllowed: admissionMocks.assertDispatchAllowed,
  firstDonorAdmissionErrorMessage: admissionMocks.firstErrorMessage,
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: commandMocks.execute,
  },
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (state: { addToast: typeof toastMocks.addToast }) => unknown) =>
    selector({ addToast: toastMocks.addToast }),
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
  Tooltip: ({ content, children }: { content: React.ReactNode; children: React.ReactNode }) => (
    <div data-tooltip={typeof content === 'string' ? content : 'dynamic'}>{children}</div>
  ),
}));

vi.mock('../dialogs/InsertBlankPageDialog', () => ({
  InsertBlankPageDialog: () => null,
}));

vi.mock('../dialogs/ReplacePageDialog', () => ({
  ReplacePageDialog: ({
    isOpen,
    onClose,
    onConfirm,
    maxPages,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (page: number) => void;
    maxPages: number;
  }) => isOpen ? (
    <div data-testid="replace-dialog" data-max-pages={maxPages}>
      <button onClick={onClose}>Cancel Replacement</button>
      <button onClick={() => onConfirm(maxPages)}>Confirm Replacement</button>
    </div>
  ) : null,
}));

function admittedReplacement(pageCount = 4): AdmittedDonorSet {
  const donor: AdmittedDonorPdf = Object.freeze({
    inputIndex: 0,
    fileName: 'donor.pdf',
    sourceBytes: 12,
    pageCount,
    ownerDocumentKey: 'doc-1',
    commandTarget: 'REPLACE_PAGE',
    handle: null,
  });
  return Object.freeze({
    source: 'TOOLBAR_ORGANIZE',
    commandTarget: 'REPLACE_PAGE',
    ownerDocumentKey: 'doc-1',
    generation: 1,
    donors: Object.freeze([donor]),
    aggregateSourceBytes: 12,
  });
}

function acceptedReplacement(pageCount = 4) {
  return {
    outcome: 'ACCEPTED' as const,
    value: admittedReplacement(pageCount),
    evidence: {
      profileId: 'DONOR_PDF' as const,
      policyVersion: 'test',
      authority: { kind: 'EXISTING_SOURCE_POLICY' as const, sourceId: 'test' },
      aggregateAuthority: { kind: 'UNRESOLVED_POLICY' as const, reason: 'test' },
      commandTarget: 'REPLACE_PAGE' as const,
      aggregateSourceBytes: 12,
      measurements: [],
      diagnostics: [],
      inputs: [],
    },
  };
}

function replaceButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector(
    '[data-tooltip="Replace current page from another PDF"] button',
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Replace button was not rendered');
  }
  return button;
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.getState().openDocument({
    documentKey: 'doc-1',
    fileName: 'active.pdf',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 3,
  });
  fileMocks.pickPdfFileSources.mockResolvedValue([{ file: new File([], 'donor.pdf') }]);
  commandMocks.execute.mockResolvedValue({
    success: true,
    commandId: 'cmd-1',
    commandType: 'REPLACE_PAGE',
    source: 'toolbar',
    mutated: true,
    message: 'Page replaced',
  });
});

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearDocument();
});

describe('ToolbarOrganize donor replacement staging', () => {
  it('opens the dialog only after admission and uses the admitted page count', async () => {
    let resolveAdmission!: (value: ReturnType<typeof acceptedReplacement>) => void;
    admissionMocks.admitDonorPdfFiles.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAdmission = resolve;
      }),
    );
    const { container } = render(<ToolbarOrganize />);

    fireEvent.click(replaceButton(container));
    expect(screen.queryByTestId('replace-dialog')).not.toBeInTheDocument();

    await act(async () => {
      resolveAdmission(acceptedReplacement(7));
    });

    const dialog = await screen.findByTestId('replace-dialog');
    expect(dialog).toHaveAttribute('data-max-pages', '7');
    expect(admissionMocks.assertDispatchAllowed).toHaveBeenCalledTimes(1);
  });

  it('clears the staged replacement when the dialog closes', async () => {
    admissionMocks.admitDonorPdfFiles.mockResolvedValueOnce(acceptedReplacement(3));
    const { container } = render(<ToolbarOrganize />);

    fireEvent.click(replaceButton(container));
    await screen.findByTestId('replace-dialog');
    fireEvent.click(screen.getByText('Cancel Replacement'));

    await waitFor(() => {
      expect(screen.queryByTestId('replace-dialog')).not.toBeInTheDocument();
    });
    expect(commandMocks.execute).not.toHaveBeenCalled();
  });

  it('clears the staged replacement when the active document changes', async () => {
    admissionMocks.admitDonorPdfFiles.mockResolvedValueOnce(acceptedReplacement(5));
    const { container } = render(<ToolbarOrganize />);

    fireEvent.click(replaceButton(container));
    await screen.findByTestId('replace-dialog');

    act(() => {
      useSessionStore.getState().openDocument({
        documentKey: 'doc-2',
        fileName: 'replacement.pdf',
        bytes: new Uint8Array([4, 5, 6]),
        pageCount: 2,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('replace-dialog')).not.toBeInTheDocument();
    });
    expect(commandMocks.execute).not.toHaveBeenCalled();
  });

  it('dispatches exactly one admitted replacement after confirmation', async () => {
    admissionMocks.admitDonorPdfFiles.mockResolvedValueOnce(acceptedReplacement(6));
    const { container } = render(<ToolbarOrganize />);

    fireEvent.click(replaceButton(container));
    await screen.findByTestId('replace-dialog');
    fireEvent.click(screen.getByText('Confirm Replacement'));

    await waitFor(() => {
      expect(commandMocks.execute).toHaveBeenCalledTimes(1);
    });
    expect(commandMocks.execute.mock.calls[0]?.[0]).toMatchObject({
      command: {
        type: 'REPLACE_PAGE',
        source: 'toolbar',
        documentKey: 'doc-1',
        payload: {
          donorResourceId: 'donor:0',
          donorPageIndex: 5,
        },
      },
      resources: {
        donors: {
          'donor:0': expect.objectContaining({
            fileName: 'donor.pdf',
            pageCount: 6,
          }),
        },
      },
    });
    expect(
      JSON.stringify(commandMocks.execute.mock.calls[0]?.[0].command),
    ).not.toContain('donor.pdf');
  });

  it('does not reopen the dialog after a stale admission completes', async () => {
    let resolveAdmission!: (value: ReturnType<typeof acceptedReplacement>) => void;
    admissionMocks.admitDonorPdfFiles.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAdmission = resolve;
      }),
    );
    const { container } = render(<ToolbarOrganize />);

    fireEvent.click(replaceButton(container));
    act(() => {
      useSessionStore.getState().openDocument({
        documentKey: 'doc-2',
        fileName: 'replacement.pdf',
        bytes: new Uint8Array([7, 8, 9]),
        pageCount: 2,
      });
    });
    await act(async () => {
      resolveAdmission(acceptedReplacement(4));
    });

    expect(screen.queryByTestId('replace-dialog')).not.toBeInTheDocument();
    expect(commandMocks.execute).not.toHaveBeenCalled();
  });
});
