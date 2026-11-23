import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RedactionApplyDialog } from './RedactionApplyDialog';
import type { RedactionRegion } from '@/core/redaction/types';

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

describe('RedactionApplyDialog', () => {
  const sampleRegions: RedactionRegion[] = [
    {
      id: 'r1',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 100, height: 30 },
      reason: 'PII',
      status: 'preview',
    },
    {
      id: 'r2',
      pageNumber: 2,
      rect: { x: 100, y: 200, width: 80, height: 25 },
      reason: 'HIPAA',
      status: 'preview',
    },
    {
      id: 'r3',
      pageNumber: 2,
      rect: { x: 200, y: 300, width: 90, height: 20 },
      reason: 'PII',
      status: 'preview',
    },
  ];

  it('renders security banner, regions count, affected pages, and categories', () => {
    render(
      <RedactionApplyDialog
        isOpen={true}
        onClose={vi.fn()}
        regions={sampleRegions}
        documentName="patient_record.pdf"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Irreversible Content Removal')).toBeInTheDocument();
    expect(screen.getByText('3 regions')).toBeInTheDocument();
    expect(screen.getByText('1, 2')).toBeInTheDocument(); // Affected pages: 1, 2
    expect(screen.getByText('PII (2)')).toBeInTheDocument();
    expect(screen.getByText('HIPAA (1)')).toBeInTheDocument();
  });

  it('defaults to Save as new redacted copy with prefilled filename and audit manifest enabled', () => {
    render(
      <RedactionApplyDialog
        isOpen={true}
        onClose={vi.fn()}
        regions={sampleRegions}
        documentName="annual_report.pdf"
        onConfirm={vi.fn()}
      />,
    );

    const saveCopyCheckbox = screen.getByTestId('redaction-save-copy-checkbox') as HTMLInputElement;
    const auditCheckbox = screen.getByTestId('redaction-audit-checkbox') as HTMLInputElement;
    const filenameInput = screen.getByTestId('redaction-filename-input') as HTMLInputElement;

    expect(saveCopyCheckbox.checked).toBe(true);
    expect(auditCheckbox.checked).toBe(true);
    expect(filenameInput.value).toBe('annual_report_redacted.pdf');
  });

  it('calls onConfirm with configured options and appends .pdf if omitted', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <RedactionApplyDialog
        isOpen={true}
        onClose={onClose}
        regions={sampleRegions}
        documentName="report.pdf"
        onConfirm={onConfirm}
      />,
    );

    const filenameInput = screen.getByTestId('redaction-filename-input');
    fireEvent.change(filenameInput, { target: { value: 'custom_redacted_doc' } });

    fireEvent.click(screen.getByTestId('redaction-confirm-button'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        saveAsCopy: true,
        outputFileName: 'custom_redacted_doc.pdf',
        downloadAuditManifest: true,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('disables submit when regions list is empty or filename is blank', () => {
    const { rerender } = render(
      <RedactionApplyDialog
        isOpen={true}
        onClose={vi.fn()}
        regions={[]} // Empty regions
        documentName="doc.pdf"
        onConfirm={vi.fn()}
      />,
    );

    const submitBtn = screen.getByTestId('redaction-confirm-button');
    expect(submitBtn).toBeDisabled();

    // Rerender with regions but blank filename
    rerender(
      <RedactionApplyDialog
        isOpen={true}
        onClose={vi.fn()}
        regions={sampleRegions}
        documentName="doc.pdf"
        onConfirm={vi.fn()}
      />,
    );

    const filenameInput = screen.getByTestId('redaction-filename-input');
    fireEvent.change(filenameInput, { target: { value: '   ' } });

    expect(screen.getByTestId('redaction-confirm-button')).toBeDisabled();
  });
});
