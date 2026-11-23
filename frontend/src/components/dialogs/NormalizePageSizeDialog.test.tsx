import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { NormalizePageSizeDialog } from './NormalizePageSizeDialog';

describe('NormalizePageSizeDialog', () => {
  it('renders with A4 preset and fit strategy by default', () => {
    render(
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={5}
        selectedPages={[]}
        currentPage={1}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Normalize Page Dimensions')).toBeInTheDocument();
    expect(screen.getByTestId('preset-A4')).toHaveClass('border-blue-600');
    expect(screen.getByTestId('strategy-fit')).toHaveClass('border-blue-600');
    expect(screen.getByRole('button', { name: 'Normalize Dimensions' })).toBeEnabled();
  });

  it('submits with default A4 fit options for all pages', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={5}
        selectedPages={[]}
        currentPage={1}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('normalize-submit-button'));

    expect(handleConfirm).toHaveBeenCalledWith({
      preset: 'A4',
      strategy: 'fit',
      orientation: 'preserve',
      pageIndices: undefined,
      customDimensions: undefined,
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('allows selecting Letter preset, center strategy, and custom page range', () => {
    const handleConfirm = vi.fn();

    render(
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={6}
        selectedPages={[]}
        currentPage={1}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('preset-Letter'));
    fireEvent.click(screen.getByTestId('strategy-center'));
    fireEvent.click(screen.getByLabelText('Custom range'));

    const rangeInput = screen.getByTestId('normalize-range-input');
    fireEvent.change(rangeInput, { target: { value: '2-4' } });

    fireEvent.click(screen.getByTestId('normalize-submit-button'));

    expect(handleConfirm).toHaveBeenCalledWith({
      preset: 'Letter',
      strategy: 'center',
      orientation: 'preserve',
      pageIndices: [1, 2, 3],
      customDimensions: undefined,
    });
  });

  it('supports custom dimensions and validates positive numbers', () => {
    const handleConfirm = vi.fn();

    render(
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={3}
        selectedPages={[]}
        currentPage={1}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('preset-Custom'));
    const widthInput = screen.getByTestId('custom-width-input');
    const heightInput = screen.getByTestId('custom-height-input');

    fireEvent.change(widthInput, { target: { value: '500' } });
    fireEvent.change(heightInput, { target: { value: '700' } });

    fireEvent.click(screen.getByTestId('normalize-submit-button'));

    expect(handleConfirm).toHaveBeenCalledWith({
      preset: 'Custom',
      strategy: 'fit',
      orientation: 'preserve',
      pageIndices: undefined,
      customDimensions: { width: 500, height: 700 },
    });
  });

  it('disables submit on invalid custom dimensions', () => {
    render(
      <NormalizePageSizeDialog
        isOpen={true}
        totalDocumentPages={3}
        selectedPages={[]}
        currentPage={1}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('preset-Custom'));
    const widthInput = screen.getByTestId('custom-width-input');
    fireEvent.change(widthInput, { target: { value: '-50' } });

    expect(screen.getByTestId('normalize-submit-button')).toBeDisabled();
  });
});
