import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  inspectPdfSignatureRisk: vi.fn(),
  composeEditablePdf: vi.fn(),
  composeCommittedPdf: vi.fn(),
  savePdfBytes: vi.fn(),
  saveAnnotations: vi.fn(),
  addToast: vi.fn(),
  commitWorkingCopy: vi.fn(),
  setSessionState: vi.fn(),
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
    documentKey: 'sha256:opened',
  },
  annotations: [] as unknown[],
  hydratedDocumentKey: 'sha256:opened' as string | null,
  sessionGeneration: 1,
  writerElements: [] as unknown[],
}));

vi.mock('@/core/pdf-signatures/signatureRisk', () => ({
  inspectPdfSignatureRisk: mocks.inspectPdfSignatureRisk,
}));

vi.mock('@/core/admission/openPdf', () => ({
  admitAndOpenPdfFile: vi.fn(),
  firstAdmissionErrorMessage: vi.fn(() => null),
}));

vi.mock('@/core/logger/service', () => ({
  error: vi.fn(),
  warn: vi.fn(),
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

vi.mock('@/core/session/store', () => {
  const getState = () => ({
    ...mocks.session,
    setSaveHandle: mocks.setSaveHandle,
    recordSaveExportAction: mocks.recordSaveExportAction,
    commitWorkingCopy: mocks.commitWorkingCopy,
    beginSaveOperation: mocks.beginSaveOperation,
    beginExportOperation: mocks.beginExportOperation,
    completeSaveOperation: mocks.completeSaveOperation,
    failSaveOperation: mocks.failSaveOperation,
  });
  return {
    getDocumentSessionGeneration: () => mocks.sessionGeneration,
    useSessionStore: Object.assign((selector: (state: unknown) => unknown) => selector(getState()), {
      getState,
      setState: mocks.setSessionState,
    }),
  };
});

vi.mock('@/core/annotations/store', () => ({
  useAnnotationStore: Object.assign((selector: (state: unknown) => unknown) => selector({ annotations: mocks.annotations }), {
    getState: () => ({ annotations: mocks.annotations, hydratedDocumentKey: mocks.hydratedDocumentKey }),
  }),
}));

vi.mock('@/core/writer/store', () => ({
  useWriterStore: Object.assign((selector: (state: unknown) => unknown) => selector({ elements: mocks.writerElements }), {
    getState: () => ({ elements: mocks.writerElements }),
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
    mocks.sessionGeneration = 1;
    mocks.annotations = [];
    mocks.hydratedDocumentKey = 'sha256:opened';
    mocks.writerElements = [];
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

  it('does not save a different document when inspection finishes after a session switch', async () => {
    let finish!: (value: { status: string; signatureCount: number; evidence: never[] }) => void;
    mocks.inspectPdfSignatureRisk.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(finish).toBeDefined();
    mocks.sessionGeneration += 1;
    await act(async () => finish({ status: 'UNSIGNED', signatureCount: 0, evidence: [] }));
    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
  });

  it('does not apply signature warning confirmation to a different document', async () => {
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = await screen.findByRole('button', { name: 'Save Anyway' });
    mocks.sessionGeneration += 1;
    fireEvent.click(confirm);
    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
  });

  it('does not reconcile an incomplete annotation model while loading a document', async () => {
    mocks.hydratedDocumentKey = null;
    mocks.inspectPdfSignatureRisk.mockResolvedValue({ status: 'UNSIGNED', signatureCount: 0, evidence: [] });
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.failSaveOperation).toHaveBeenCalledWith(expect.stringContaining('annotations are still loading')));
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
  });

  it('fails safe when signature state is unknown and waits for explicit confirmation', async () => {
    mocks.inspectPdfSignatureRisk.mockResolvedValue({
      status: 'UNKNOWN',
      signatureCount: 0,
      evidence: [],
      reason: 'PDF_PARSE_FAILED',
    });

    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/could not determine whether this PDF contains digital signatures/i),
    ).toBeInTheDocument();
    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
    expect(mocks.saveAnnotations).not.toHaveBeenCalled();
    expect(mocks.commitWorkingCopy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Anyway' }));

    await waitFor(() => {
      expect(mocks.composeEditablePdf).toHaveBeenCalledTimes(1);
      expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1);
    });
  });

  it('warns before any save side effect and Cancel leaves the document untouched', async () => {
    render(<ToolbarFile />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/may invalidate existing digital signatures/i)).toBeInTheDocument();
    expect(mocks.inspectPdfSignatureRisk).toHaveBeenCalledWith(mocks.session.workingBytes);
    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
    expect(mocks.saveAnnotations).not.toHaveBeenCalled();
    expect(mocks.commitWorkingCopy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.beginSaveOperation).not.toHaveBeenCalled();
    expect(mocks.composeEditablePdf).not.toHaveBeenCalled();
    expect(mocks.savePdfBytes).not.toHaveBeenCalled();
    expect(mocks.saveAnnotations).not.toHaveBeenCalled();
    expect(mocks.commitWorkingCopy).not.toHaveBeenCalled();
  });

  it('continues through the existing editable Save path only after confirmation', async () => {
    // Emulate an acknowledged file-system write rather than an unverified download.
    mocks.savePdfBytes.mockResolvedValue({} as FileSystemFileHandle);
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
    await waitFor(() => expect(mocks.setSessionState).toHaveBeenCalledWith({
      isDirty: false, isDocumentDirty: false, isReviewDirty: false, isSessionDirty: false,
    }));
    expect(mocks.commitWorkingCopy).not.toHaveBeenCalled();
    expect(mocks.clearWriterElementsAfterCommit).not.toHaveBeenCalled();
  });

  it('does not mark edits made during an asynchronous save as saved', async () => {
    mocks.savePdfBytes.mockResolvedValue({} as FileSystemFileHandle);
    mocks.inspectPdfSignatureRisk.mockResolvedValue({ status: 'UNSIGNED', signatureCount: 0, evidence: [] });
    let finish: ((result: unknown) => void) | undefined;
    mocks.composeEditablePdf.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(finish).toBeDefined());
    mocks.annotations = [{ id: 'newer-edit' }];
    finish!({ bytes: new Uint8Array([9, 9, 9]), pageCount: 1, documentKey: 'sha256:saved' });
    await waitFor(() => expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.completeSaveOperation).toHaveBeenCalledWith(expect.stringContaining('newer changes remain unsaved')));
    expect(mocks.saveAnnotations).toHaveBeenCalledWith('sha256:opened', mocks.annotations);
    expect(mocks.setSessionState).not.toHaveBeenCalled();
  });

  it('does not report an unverified anchor download as a durable Save', async () => {
    mocks.inspectPdfSignatureRisk.mockResolvedValue({
      status: 'UNSIGNED', signatureCount: 0, evidence: [],
    });
    // No File System Access API receipt: FileAdapter returns null after starting a download.
    mocks.savePdfBytes.mockResolvedValue(null);
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: 'Download Started — Save Not Confirmed',
    })));
    expect(mocks.completeSaveOperation).not.toHaveBeenCalled();
    expect(mocks.setSessionState).not.toHaveBeenCalledWith({
      isDirty: false, isDocumentDirty: false, isReviewDirty: false, isSessionDirty: false,
    });
    expect(mocks.setSessionState).toHaveBeenCalledWith(expect.objectContaining({
      saveState: expect.objectContaining({ status: 'idle' }),
    }));
    expect(mocks.recordSaveExportAction).toHaveBeenCalledWith(
      { type: 'DOWNLOAD_PROCESSED_PDF' }, 'success',
      expect.stringContaining('cannot be verified'),
    );
  });

  it('does not open Save As after a failed handle write for a previous session', async () => {
    mocks.session.saveHandle = {} as FileSystemFileHandle;
    mocks.inspectPdfSignatureRisk.mockResolvedValue({ status: 'UNSIGNED', signatureCount: 0, evidence: [] });
    let rejectWrite!: (error: Error) => void;
    mocks.savePdfBytes.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
    render(<ToolbarFile />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rejectWrite).toBeDefined());
    mocks.sessionGeneration += 1;
    await act(async () => rejectWrite(new DOMException('stale handle', 'NotReadableError')));
    expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1);
    expect(mocks.failSaveOperation).not.toHaveBeenCalled();
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
