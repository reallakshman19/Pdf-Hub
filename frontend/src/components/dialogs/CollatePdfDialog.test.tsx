import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { CollatePdfDialog } from './CollatePdfDialog';

describe('CollatePdfDialog', () => {
  it('renders with document comparison summary and forward pattern by default', () => {
    render(
      <CollatePdfDialog
        isOpen={true}
        primaryFileName="oddpagesscan.pdf"
        primaryPageCount={3}
        donorFileName="evenpagesscan.pdf"
        donorPageCount={3}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Collate / Interleave Document')).toBeInTheDocument();
    expect(screen.getByText('oddpagesscan.pdf')).toBeInTheDocument();
    expect(screen.getByText('evenpagesscan.pdf')).toBeInTheDocument();
    expect(screen.getByText('Forward Alternating')).toBeInTheDocument();
    expect(screen.getByText('Reverse Duplex Scan')).toBeInTheDocument();
    expect(screen.getByText(/resulting sequence \(6 pages total\)/i)).toBeInTheDocument();
  });

  it('submits with forward mode and all donor pages', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CollatePdfDialog
        isOpen={true}
        primaryFileName="doc1.pdf"
        primaryPageCount={2}
        donorFileName="doc2.pdf"
        donorPageCount={2}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('collate-submit-button'));

    expect(handleConfirm).toHaveBeenCalledWith({
      mode: 'forward',
      donorPageIndices: undefined,
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('switches to reverse-duplex mode and custom range', () => {
    const handleConfirm = vi.fn();

    render(
      <CollatePdfDialog
        isOpen={true}
        primaryFileName="fronts.pdf"
        primaryPageCount={3}
        donorFileName="backs.pdf"
        donorPageCount={5}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    // Switch mode
    fireEvent.click(screen.getByTestId('collate-mode-reverse-duplex'));

    // Switch page scope to custom
    fireEvent.click(screen.getByLabelText('Custom range'));

    const rangeInput = screen.getByTestId('collate-range-input');
    fireEvent.change(rangeInput, { target: { value: '1-3' } });

    fireEvent.click(screen.getByTestId('collate-submit-button'));

    expect(handleConfirm).toHaveBeenCalledWith({
      mode: 'reverse-duplex',
      donorPageIndices: [0, 1, 2],
    });
  });

  it('disables submit on invalid donor range input', () => {
    render(
      <CollatePdfDialog
        isOpen={true}
        primaryFileName="fronts.pdf"
        primaryPageCount={3}
        donorFileName="backs.pdf"
        donorPageCount={3}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Custom range'));
    const rangeInput = screen.getByTestId('collate-range-input');
    fireEvent.change(rangeInput, { target: { value: '10' } });

    expect(screen.getByTestId('collate-submit-button')).toBeDisabled();
    expect(screen.getByText(/exceeds/i)).toBeInTheDocument();
  });
});
