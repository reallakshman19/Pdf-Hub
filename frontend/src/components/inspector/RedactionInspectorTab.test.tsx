import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RedactionInspectorTab } from './RedactionInspectorTab';
import { addRegion, clearRegions, getState } from '@/core/redaction/store';
import { useSessionStore } from '@/core/session/store';

vi.mock('@/components/dialogs/RedactionApplyDialog', () => ({
  RedactionApplyDialog: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Apply Permanent Redactions">
        <span>Redaction Dialog Open</span>
        <button onClick={onClose}>Close Dialog</button>
      </div>
    ) : null,
}));

describe('RedactionInspectorTab', () => {
  beforeEach(() => {
    clearRegions();
    useSessionStore.getState().openDocument({
      documentKey: 'doc:test',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 2,
    });
  });

  it('renders empty state when no redactions are marked', () => {
    render(<RedactionInspectorTab />);

    expect(screen.getByText('No redactions marked')).toBeInTheDocument();
    expect(screen.getByText(/0 staged/i)).toBeInTheDocument();
    expect(screen.getByTestId('redaction-apply-button')).toBeDisabled();
  });

  it('renders marked regions and allows editing reason', () => {
    const reg1 = addRegion(1, { x: 50, y: 50, width: 100, height: 40 }, 'Initial PII');
    addRegion(2, { x: 100, y: 150, width: 80, height: 30 });

    render(<RedactionInspectorTab />);

    expect(screen.getByText('2 staged')).toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByTestId('redaction-apply-button')).not.toBeDisabled();

    // Edit reason for region 1
    const reasonInput = screen.getByTestId(`region-reason-input-${reg1.id}`);
    fireEvent.change(reasonInput, { target: { value: 'Updated HIPAA Category' } });

    expect(getState().regions[0].reason).toBe('Updated HIPAA Category');
  });

  it('deletes an individual region and clears all regions', () => {
    const reg1 = addRegion(1, { x: 10, y: 10, width: 50, height: 20 });
    addRegion(1, { x: 60, y: 10, width: 50, height: 20 });

    render(<RedactionInspectorTab />);

    expect(screen.getByText('2 staged')).toBeInTheDocument();

    // Delete first region
    fireEvent.click(screen.getByTestId(`delete-region-${reg1.id}`));
    expect(getState().regions).toHaveLength(1);

    // Clear remaining
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(getState().regions).toHaveLength(0);
    expect(screen.getByText('No redactions marked')).toBeInTheDocument();
  });

  it('opens RedactionApplyDialog when Apply All Redactions is clicked', () => {
    addRegion(1, { x: 20, y: 20, width: 100, height: 50 });

    render(<RedactionInspectorTab />);

    fireEvent.click(screen.getByTestId('redaction-apply-button'));

    expect(screen.getByRole('dialog', { name: 'Apply Permanent Redactions' })).toBeInTheDocument();
    expect(screen.getByText('Redaction Dialog Open')).toBeInTheDocument();
  });
});
