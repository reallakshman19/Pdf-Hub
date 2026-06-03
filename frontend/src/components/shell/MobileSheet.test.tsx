import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileSheet } from './MobileSheet';
import { within } from '@testing-library/react';

describe('MobileSheet', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div data-testid="sheet-children">Sheet Content</div>,
  };

  it('renders children when open', () => {
    render(<MobileSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet-children')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-hidden', 'false');
  });

  it('sets aria-hidden true when closed', () => {
    render(<MobileSheet {...defaultProps} isOpen={false} />);
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<MobileSheet {...defaultProps} />);
    const backdrop = screen.getByTestId('sheet-backdrop');
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    render(<MobileSheet {...defaultProps} />);
    const closeBtn = screen.getByTestId('sheet-close');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<MobileSheet {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('sheet pane has max-h-[60vh] class (M1-T1: height constraint)', () => {
    render(<MobileSheet {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const pane = dialog.querySelector('[class*="max-h-\\[60vh\\]"]');
    expect(pane).not.toBeNull();
  });

  it('renders drag handle with sheet-handle testid (M1-T2)', () => {
    render(<MobileSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet-handle')).toBeInTheDocument();
  });

  it('renders inspector children inside the sheet pane (M1-T5)', () => {
    render(<MobileSheet {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('sheet-children')).toBeInTheDocument();
  });
});
