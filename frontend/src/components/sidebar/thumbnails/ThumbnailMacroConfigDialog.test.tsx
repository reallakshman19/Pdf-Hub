import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThumbnailMacroConfigDialog } from './ThumbnailMacroConfigDialog';

describe('ThumbnailMacroConfigDialog visual mask guardrail', () => {
  it('uses explicit non-secure wording and emits a visual-mask warning', () => {
    const onApply = vi.fn();

    render(
      <ThumbnailMacroConfigDialog
        kind="redaction"
        pageIndices={[0, 1]}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByText(/visual mask \(not secure redaction\)/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/do not permanently remove/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/searchable, copyable, or extractable/i);

    fireEvent.click(screen.getByRole('button', { name: /apply visual mask/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      type: 'DRAW_REDACTION_BOX',
      pageIndices: [0, 1],
    });
    expect(onApply.mock.calls[0]?.[1]).toMatch(/not securely removed/i);
  });
});
