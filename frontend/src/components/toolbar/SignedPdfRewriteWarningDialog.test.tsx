import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SignedPdfRewriteWarningDialog } from './SignedPdfRewriteWarningDialog';

describe('SignedPdfRewriteWarningDialog', () => {
  it('states that Save may invalidate signatures without claiming preservation', () => {
    render(
      <SignedPdfRewriteWarningDialog
        signatureCount={2}
        status="SIGNED"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText(/may invalidate existing digital signatures/i)).toBeInTheDocument();
    expect(screen.getByText(/does not currently preserve signature validity/i)).toBeInTheDocument();
    expect(screen.queryByText(/signature.*preserved/i)).toBeNull();
  });

  it('warns explicitly when signature state cannot be determined', () => {
    render(
      <SignedPdfRewriteWarningDialog
        status="UNKNOWN"
        signatureCount={0}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/could not determine whether this PDF contains digital signatures/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/saving may invalidate signatures if they are present/i)).toBeInTheDocument();
    expect(screen.getByText(/does not currently preserve signature validity/i)).toBeInTheDocument();
  });

  it('supports an explicit cancel or Save Anyway decision', () => {
    const onCancel = vi.fn();
    const onContinue = vi.fn();

    render(
      <SignedPdfRewriteWarningDialog
        signatureCount={1}
        status="SIGNED"
        onCancel={onCancel}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Anyway' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
