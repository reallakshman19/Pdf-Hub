import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ExtractPagesDialog } from './ExtractPagesDialog';

describe('ExtractPagesDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders extract mode with initial selected pages and defaults', () => {
    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="report_2026.pdf"
        currentPage={1}
        totalDocumentPages={10}
        selectedPages={[2, 3]}
        initialMode="extract"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Extract Pages' })).toBeInTheDocument();
    expect(screen.getByText(/report_2026\.pdf \(10 pages\)/i)).toBeInTheDocument();

    const rangeInput = screen.getByTestId('extract-page-range-input') as HTMLInputElement;
    expect(rangeInput.value).toBe('2, 3');

    const filenameInput = screen.getByTestId('extract-filename-input') as HTMLInputElement;
    expect(filenameInput.value).toBe('report_2026_extracted.pdf');

    expect(screen.getByRole('button', { name: /extract & download/i })).toBeEnabled();
  });

  it('submits extract action with correct 0-based page indices and filename', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="contracts.pdf"
        currentPage={1}
        totalDocumentPages={8}
        selectedPages={[1]}
        initialMode="extract"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    const rangeInput = screen.getByTestId('extract-page-range-input');
    fireEvent.change(rangeInput, { target: { value: '2-4, 7' } });

    const filenameInput = screen.getByTestId('extract-filename-input');
    fireEvent.change(filenameInput, { target: { value: 'custom_extract.pdf' } });

    fireEvent.click(screen.getByRole('button', { name: /extract & download/i }));

    expect(handleConfirm).toHaveBeenCalledWith({
      pageIndices: [1, 2, 3, 6],
      mode: 'extract',
      outputFileName: 'custom_extract.pdf',
    });
  });

  it('automatically appends .pdf extension if omitted by user', () => {
    const handleConfirm = vi.fn();

    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="contracts.pdf"
        currentPage={1}
        totalDocumentPages={8}
        selectedPages={[1]}
        initialMode="extract"
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    const filenameInput = screen.getByTestId('extract-filename-input');
    fireEvent.change(filenameInput, { target: { value: 'my_selection' } });

    fireEvent.click(screen.getByRole('button', { name: /extract & download/i }));

    expect(handleConfirm).toHaveBeenCalledWith({
      pageIndices: [0],
      mode: 'extract',
      outputFileName: 'my_selection.pdf',
    });
  });

  it('switches between extract and split modes dynamically', () => {
    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="manual.pdf"
        currentPage={1}
        totalDocumentPages={6}
        selectedPages={[1]}
        initialMode="extract"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Extract Pages' })).toBeInTheDocument();

    // Click split mode
    fireEvent.click(screen.getByTestId('mode-split-button'));

    expect(screen.getByRole('heading', { name: 'Split Document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /split & download/i })).toBeInTheDocument();

    const filenameInput = screen.getByTestId('extract-filename-input') as HTMLInputElement;
    expect(filenameInput.value).toBe('manual_split.pdf');
  });

  it('prevents splitting all pages from document in split mode', () => {
    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="short.pdf"
        currentPage={1}
        totalDocumentPages={3}
        selectedPages={[1, 2, 3]}
        initialMode="split"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Cannot split every page\. At least one page must remain in the document\./i),
    ).toBeInTheDocument();

    const submitBtn = screen.getByTestId('extract-submit-button');
    expect(submitBtn).toBeDisabled();
  });

  it('shows validation error and disables submit for invalid ranges', () => {
    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="doc.pdf"
        currentPage={1}
        totalDocumentPages={5}
        selectedPages={[1]}
        initialMode="extract"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const rangeInput = screen.getByTestId('extract-page-range-input');
    fireEvent.change(rangeInput, { target: { value: '1, 99' } });

    expect(screen.getByText(/Page number 99 exceeds source document length/i)).toBeInTheDocument();
    expect(screen.getByTestId('extract-submit-button')).toBeDisabled();
  });

  it('calls onClose when close or cancel button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="doc.pdf"
        currentPage={1}
        totalDocumentPages={5}
        selectedPages={[1]}
        onClose={handleClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('supports packaging extracted pages into a zip bundle', () => {
    const handleConfirm = vi.fn();

    render(
      <ExtractPagesDialog
        isOpen={true}
        documentFileName="report.pdf"
        currentPage={1}
        totalDocumentPages={10}
        selectedPages={[1, 2, 3]}
        initialMode="extract"
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    const zipCheckbox = screen.getByTestId('extract-zip-checkbox');
    expect(zipCheckbox).not.toBeChecked();

    fireEvent.click(zipCheckbox);
    expect(zipCheckbox).toBeChecked();

    const filenameInput = screen.getByTestId('extract-filename-input') as HTMLInputElement;
    expect(filenameInput.value).toBe('report_extracted_pages.zip');

    fireEvent.click(screen.getByRole('button', { name: /extract & download/i }));

    expect(handleConfirm).toHaveBeenCalledWith({
      pageIndices: [0, 1, 2],
      mode: 'extract',
      outputFileName: 'report_extracted_pages.zip',
      packageAsZip: true,
    });
  });
});
