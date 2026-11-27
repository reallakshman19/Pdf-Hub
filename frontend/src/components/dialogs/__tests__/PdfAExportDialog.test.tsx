import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const mocks = vi.hoisted(() => ({
  savePdfBytes: vi.fn(async () => null),
  downloadBytes: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    MAX_PDF_SIZE_MB: 100,
    MAX_PDF_SIZE_BYTES: 100 * 1024 * 1024,
    savePdfBytes: mocks.savePdfBytes,
    downloadBytes: mocks.downloadBytes,
    hashBytes: vi.fn(async () => 'sha256:mock'),
  },
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (s: unknown) => unknown) => selector({ addToast: mocks.addToast }),
}));

import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { PdfAExportDialog } from '../PdfAExportDialog';

async function makeTestPdf(transparent = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Archival Dialog Test', { x: 72, y: 720, font, size: 12 });
  if (transparent) {
    page.drawRectangle({ x: 72, y: 650, width: 100, height: 30, color: rgb(1, 1, 0), opacity: 0.4 });
  }
  return doc.save();
}

describe('PdfAExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWriterV2Store.getState().clearWriterV2();
  });

  it('runs live preflight, edits metadata, and exports verified PDF/A-2b + JSON certificate without mutating session', async () => {
    const bytes = await makeTestPdf(false);
    useSessionStore.setState({
      workingBytes: bytes,
      originalBytes: bytes,
      fileName: 'contract.pdf',
      documentKey: 'sha256:contract',
      pageCount: 1,
    });

    const onClose = vi.fn();
    render(<PdfAExportDialog isOpen onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId('pdfa-check-PDFA-FONTS-STD14')).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText('Document Title') as HTMLInputElement;
    expect(titleInput.value).toBe('contract');
    fireEvent.change(titleInput, { target: { value: 'Executed Contract 2026' } });

    const submit = screen.getByTestId('pdfa-export-submit');
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.savePdfBytes).toHaveBeenCalledTimes(1);
    });

    const [savedBytes, savedName] = mocks.savePdfBytes.mock.calls[0] as unknown as [Uint8Array, string];
    expect(savedName).toBe('contract-pdfa-2b.pdf');
    expect(savedBytes.length).toBeGreaterThan(0);
    expect(mocks.downloadBytes).toHaveBeenCalledTimes(1);
    expect(mocks.downloadBytes.mock.calls[0][1]).toBe('contract-pdfa-2b-report.json');
    expect(useSessionStore.getState().workingBytes).toBe(bytes);
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks PDF/A-1b export when transparency is detected until user switches or opts into rasterization', async () => {
    const bytes = await makeTestPdf(true);
    useSessionStore.setState({
      workingBytes: bytes,
      originalBytes: bytes,
      fileName: 'translucent.pdf',
      documentKey: 'sha256:transp',
      pageCount: 1,
    });

    render(<PdfAExportDialog isOpen onClose={vi.fn()} initialConformance="PDFA_1B" />);

    await waitFor(() => {
      expect(screen.getByTestId('pdfa-check-PDFA-TRANSP')).toBeInTheDocument();
    });

    const submit = screen.getByTestId('pdfa-export-submit');
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('pdfa-level-PDFA_2B'));
    await waitFor(() => {
      expect(submit).not.toBeDisabled();
    });
  });
});
