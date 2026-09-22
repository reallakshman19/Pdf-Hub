import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  inspectPdfSignatureRisk: vi.fn(),
  composeEditablePdf: vi.fn(),
  composeCommittedPdf: vi.fn(),
  savePdfBytes: vi.fn(),
  saveAnnotations: vi.fn(),
  addToast: vi.fn(),
  commitWorkingCopy: vi.fn(),
  beginSaveOperation: vi.fn(),
  beginExportOperation: vi.fn(),
  completeSaveOperation: vi.fn(),
  failSaveOperation: vi.fn(),
  recordSaveExportAction: vi.fn(),
  setSaveHandle: vi.fn(),
  clearWriterElementsAfterCommit: vi.fn(),
  session: {
    workingBytes: new Uint8Array([1, 2, 3]),
    fileName: 'signed.pdf',
    saveHandle: null as FileSystemFileHandle | null,
    isDirty: true,
  },
}));

vi.mock('@/core/pdf-signatures/signatureRisk', () => ({
  inspectPdfSignatureRisk: mocks.inspectPdfSignatureRisk,
}));

vi.mock('@/core/document/commitPipeline', () => ({
  composeEditablePdf: mocks.composeEditablePdf,
  composeCommittedPdf: mocks.composeCommittedPdf,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    pickPdfFileSources: vi.fn(),
    savePdfBytes: mocks.savePdfBytes,
    downloadBytes: vi.fn(),
  },
}));

vi.mock('@/core/annotations/persistence', () => ({
  saveAnnotations: mocks.saveAnnotations,
}));

vi.mock('@/core/session/store', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) => selector({
    ...mocks.session,
    setSaveHandle: mocks.setSaveHandle,
    recordSaveExportAction: mocks.recordSaveExportAction,
    commitWorkingCopy: mocks.commitWorkingCopy,
    beginSaveOperation: mocks.beginSaveOperation,
    beginExportOperation: mocks.beginExportOperation,
    completeSaveOperation: mocks.completeSaveOperation,
    failSaveOperation: mocks.failSaveOperation,
  }),
}));

vi.mock('@/core/annotations/store', () => ({
  useAnnotationStore: (selector: (state: unknown) => unknown) => selector({
    annotations: [],
  }),
}));

vi.mock('@/core/writer/store', () => ({
  useWriterStore: (selector: (state: unknown) => unknown) => selector({
    elements: [],
    clearElementsAfterCommit: mocks.clearWriterElementsAfterCommit,
  }),
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (state: unknown) => unknown) => selector({
    addToast: mocks.addToast,
  }),
}));

import { ToolbarFile } from './ToolbarFile';

describe('ToolbarFile signed PDF Save preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.workingBytes = new Uint8Array([1, 2, 3]);
    mocks.session.fileName = 'signed.pdf';
    mocks.session.saveHandle = null;
    mocks.inspectPdfSignatureRisk.mockResolvedValue({
      status: 'SIGNED',
      signatureCount: 1,
      evidence: ['BYTE_RANGE_AND_CONTENTS'],
    });
    mocks.composeEditablePdf.mockResolvedValue({
      bytes: new Uint8Array([9, 9, 9]),
      pageCount: 1,
      documentKey: 'sha256:saved',
      committedAnnotationCount: 0,
      committedWriterElementCount: 0,
      hadAnnotations: false,
      hadWriterElements: false,
      writerExportWarnings: [],
    });
    mocks.saveAnnotations.mockResolvedValue(undefined);
    mocks.savePdfBytes.mockResolvedValue(null);
  });

  it('saves an unsigned PDF without showing the signature warning', async () => {
    mocks.inspectPdfSignatureRisk.mockResolvedValue({
      status: 'UNSIGNED',
      signatureCount: 0,
      evidence: [],
    });

    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.composeEditablePdf).toHaveBeenCalledTimes(1);
      expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText(/may invalidate existing digital signatures/i)).toBeNull();
    expect(mocks.inspectPdfSignatureRisk).toHaveBeenCalledTimes(1);
  });

  it('warns before any save side effect and Cancel leaves the document untouched', async () => {
    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/may invalidate existing digital signatures/i)).toBeInTheDocument();
    expect(mocks.inspectPdfSignatureRisk).toHaveBeenCalledWith(mocks.session.workingBytes);
    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
    expect(mocks.commitWorkingCopy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
  });

  it('continues through the existing editable Save path only after confirmation', async () => {
    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Save Anyway' });
    fireEvent.click(screen.getByRole('button', { name: 'Save Anyway' }));

    await waitFor(() => {
      expect(mocks.composeEditablePdf).toHaveBeenCalledTimes(1);
      expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1);
    });

    expect(mocks.inspectPdfSignatureRisk).toHaveBeenCalledTimes(1);
    expect(mocks.beginSaveOperation).toHaveBeenCalledTimes(1);
    expect(mocks.commitWorkingCopy).toHaveBeenCalledTimes(1);
  });

  it('does not re-prompt when the confirmed Save falls back to Save As', async () => {
    const staleHandle = {} as FileSystemFileHandle;
    mocks.session.saveHandle = staleHandle;
    mocks.savePdfBytes
      .mockRejectedValueOnce(new DOMException('stale handle', 'NotReadableError'))
      .mockResolvedValueOnce(null);

    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save Anyway' }));

    await waitFor(() => {
      expect(mocks.savePdfBytes).toHaveBeenCalledTimes(2);
    });

    expect(mocks.inspectPdfSignatureRisk).toHaveBeenCalledTimes(1);
    expect(mocks.savePdfBytes).toHaveBeenNthCalledWith(
      1,
      expect.any(Uint8Array),
      'signed.pdf',
      staleHandle,
    );
    expect(mocks.savePdfBytes).toHaveBeenNthCalledWith(
      2,
      expect.any(Uint8Array),
      'signed.pdf',
      null,
    );
  });
});
