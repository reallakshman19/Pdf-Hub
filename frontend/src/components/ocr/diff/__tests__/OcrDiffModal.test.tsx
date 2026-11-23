import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OcrDiffModal } from '../OcrDiffModal';

describe('OcrDiffModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <OcrDiffModal
        isOpen={false}
        onClose={vi.fn()}
        referenceText="Original text"
        ocrText="Ocr text"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders diff metrics and aligned token contents when open', () => {
    const original = 'Invoice total is $500.00 due immediately';
    const ocrScan = 'Invoice total is $500.00 due tomorrow'; // replace immediately -> tomorrow

    render(
      <OcrDiffModal
        isOpen={true}
        onClose={vi.fn()}
        referenceText={original}
        ocrText={ocrScan}
      />,
    );

    expect(screen.getByTestId('ocr-diff-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ocr-diff-similarity')).toHaveTextContent(/%/);
    expect(screen.getByTestId('ocr-diff-wer')).toHaveTextContent(/0\./);

    // Tokens rendered
    const content = screen.getByTestId('ocr-diff-content');
    expect(content).toHaveTextContent('Invoice');
    expect(content).toHaveTextContent('immediately');
    expect(content).toHaveTextContent('tomorrow');
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <OcrDiffModal
        isOpen={true}
        onClose={handleClose}
        referenceText="Hello"
        ocrText="World"
      />,
    );

    const closeBtn = screen.getByTestId('ocr-diff-close');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
