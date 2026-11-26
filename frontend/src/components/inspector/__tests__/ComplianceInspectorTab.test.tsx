import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { ComplianceInspectorTab } from '../ComplianceInspectorTab';

describe('ComplianceInspectorTab', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders empty state when no document is loaded', () => {
    useSessionStore.setState({
      workingBytes: null,
      documentKey: null,
      fileName: null,
      pageCount: 0,
    });
    render(<ComplianceInspectorTab />);
    expect(screen.getByTestId('compliance-inspector-empty')).toBeInTheDocument();
  });

  it('audits loaded PDF bytes lazily and opens PdfAExportDialog on button click', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText('Inspector Compliance Check', { x: 72, y: 700, font, size: 12 });
    const bytes = await doc.save();

    useSessionStore.setState({
      workingBytes: bytes,
      documentKey: 'sha256:insp',
      fileName: 'insp.pdf',
      pageCount: 1,
    });

    render(<ComplianceInspectorTab />);

    await waitFor(() => {
      expect(screen.getByTestId('compliance-inspector-tab')).toBeInTheDocument();
      expect(screen.getByText(/Fonts Embedded/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('compliance-open-export-btn'));
    expect(screen.getByTestId('pdfa-export-dialog')).toBeInTheDocument();
  });
});
