import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { InsertPdfDialog } from './InsertPdfDialog';

describe('InsertPdfDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders donor file metadata and default configuration', () => {
    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="invoice_pages.pdf"
        donorPageCount={4}
        currentPage={2}
        totalDocumentPages={5}
        initialPlacement="after"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Insert Pages from PDF')).toBeInTheDocument();
    expect(screen.getByText('invoice_pages.pdf')).toBeInTheDocument();
    expect(screen.getByText('4 total pages available')).toBeInTheDocument();
    expect(screen.getByLabelText(/All pages \(1–4\)/i)).toBeChecked();
  });

  it('confirms with all pages and placement after by default', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="document.pdf"
        donorPageCount={3}
        currentPage={2}
        totalDocumentPages={5}
        initialPlacement="after"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    expect(handleConfirm).toHaveBeenCalledWith({
      donorPageIndices: undefined,
      placement: 'after',
      targetPage: 2,
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('parses custom page range and passes 0-based indices on confirm', () => {
    const handleConfirm = vi.fn();

    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="document.pdf"
        donorPageCount={5}
        currentPage={1}
        totalDocumentPages={10}
        initialPlacement="before"
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    // Switch to custom range
    fireEvent.click(screen.getByLabelText(/Selected pages or range/i));

    const rangeInput = screen.getByLabelText('Custom page range');
    fireEvent.change(rangeInput, { target: { value: '1, 3-4' } });

    expect(screen.getByText('3 page(s) selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    expect(handleConfirm).toHaveBeenCalledWith({
      donorPageIndices: [0, 2, 3],
      placement: 'before',
      targetPage: 1,
    });
  });

  it('disables submit button and shows error on invalid page range', () => {
    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="document.pdf"
        donorPageCount={3}
        currentPage={1}
        totalDocumentPages={5}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Selected pages or range/i));

    const rangeInput = screen.getByLabelText('Custom page range');
    fireEvent.change(rangeInput, { target: { value: '1-10' } });

    expect(screen.getByText(/exceeds source document length/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Pages' })).toBeDisabled();
  });

  it('shows error and disables submit when duplicate pages are entered', () => {
    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="document.pdf"
        donorPageCount={3}
        currentPage={1}
        totalDocumentPages={5}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Selected pages or range/i));
    const rangeInput = screen.getByLabelText('Custom page range');
    fireEvent.change(rangeInput, { target: { value: '1, 1' } });

    expect(screen.getByText('Duplicate page number 1 detected in range.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Pages' })).toBeDisabled();
  });

  it('preserves user-specified order in custom page range', () => {
    const handleConfirm = vi.fn();
    render(
      <InsertPdfDialog
        isOpen={true}
        donorFileName="document.pdf"
        donorPageCount={5}
        currentPage={2}
        totalDocumentPages={5}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Selected pages or range/i));
    const rangeInput = screen.getByLabelText('Custom page range');
    fireEvent.change(rangeInput, { target: { value: '3, 1' } });

    expect(screen.getByText('2 page(s) selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert Pages' }));

    expect(handleConfirm).toHaveBeenCalledWith({
      donorPageIndices: [2, 0],
      placement: 'after',
      targetPage: 2,
    });
  });
});
