import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { BatchRunDialog } from './BatchRunDialog';

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) => isOpen ? (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ) : null,
}));

describe('BatchRunDialog', () => {
  it('uses canonical safe recipes and excludes ambiguous or destructive workflows', () => {
    render(
      <BatchRunDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Footer Page Numbers')).toBeInTheDocument();
    expect(screen.getByText('Review Stamp — Current Page')).toBeInTheDocument();

    expect(screen.queryByText('Rotate Selected Pages 90°')).toBeNull();
    expect(screen.queryByText('Extract Selected Pages')).toBeNull();
    expect(screen.queryByText('Remove Selected Pages')).toBeNull();
    expect(screen.queryByText('Merge Two Donor Files')).toBeNull();
    expect(screen.queryByText('Replace First Page from Donor')).toBeNull();
  });

  it('returns the selected canonical recipe', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <BatchRunDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText('Batch workflow'), {
      target: { value: 'footer-page-numbers' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose PDFs & Run' }),
    );

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'footer-page-numbers',
        name: 'Footer Page Numbers',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks confirmation while another Automate workflow is active', () => {
    render(
      <BatchRunDialog
        isOpen
        disabled
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Batch workflow')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Choose PDFs & Run' }),
    ).toBeDisabled();
  });
});
