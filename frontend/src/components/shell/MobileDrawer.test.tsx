import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileDrawer } from './MobileDrawer';
import { within } from '@testing-library/react';

describe('MobileDrawer', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div data-testid="drawer-children">Drawer Child</div>,
  };

  it('renders children when open', () => {
    render(<MobileDrawer {...defaultProps} />);
    expect(screen.getByTestId('drawer-children')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-hidden', 'false');
  });

  it('sets aria-hidden true when closed', () => {
    render(<MobileDrawer {...defaultProps} isOpen={false} />);
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<MobileDrawer {...defaultProps} />);
    const backdrop = screen.getByTestId('drawer-backdrop');
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    render(<MobileDrawer {...defaultProps} />);
    const closeBtn = screen.getByTestId('drawer-close');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<MobileDrawer {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('drawer pane has max-w-[85vw] class (H4-T4: width constraint)', () => {
    render(<MobileDrawer {...defaultProps} />);
    // The inner pane — the sibling of the backdrop — carries the width constraint
    const dialog = screen.getByRole('dialog');
    const pane = dialog.querySelector('[class*="max-w-\\[85vw\\]"]');
    expect(pane).not.toBeNull();
  });

  it('renders sidebar children inside the drawer pane (H4-T5)', () => {
    render(<MobileDrawer {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('drawer-children')).toBeInTheDocument();
  });
});
