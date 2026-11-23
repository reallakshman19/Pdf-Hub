import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BlankDocumentPageSetupDialog } from '../BlankDocumentPageSetupDialog';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';
import type { WriterPageSetupV2 } from '@/core/writer-v2/types';

describe('BlankDocumentPageSetupDialog — Templates', () => {
  const baseSetup: WriterPageSetupV2 = {
    ...WRITER_PAGE_PRESETS.A4,
  };

  it('initializes template controls from existing pageSetup', () => {
    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={{
          ...baseSetup,
          pageTemplate: {
            kind: 'dot-grid',
            spacing: 20,
          },
        }}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    const templateSelect = screen.getByTestId('blank-page-setup-template-select');
    expect(templateSelect).toHaveValue('dot-grid');

    const spacingInput = screen.getByTestId('blank-page-setup-template-spacing-input');
    expect(spacingInput).toHaveValue(20);
    expect(screen.getByTestId('blank-page-setup-summary')).toHaveTextContent('Dot Grid');
  });

  it('updates template to Ruled Notebook and applies it', () => {
    const onApply = vi.fn();

    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={baseSetup}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-page-setup-template-select'), {
      target: { value: 'ruled' },
    });

    const spacingInput = screen.getByTestId('blank-page-setup-template-spacing-input');
    expect(spacingInput).toHaveValue(24);

    fireEvent.change(spacingInput, {
      target: { value: '28' },
    });

    fireEvent.click(screen.getByTestId('blank-page-setup-apply-button'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied.pageTemplate).toBeDefined();
    expect(applied.pageTemplate?.kind).toBe('ruled');
    expect(applied.pageTemplate?.spacing).toBe(28);
  });

  it('preserves existing pageTemplates per-page overrides when updating global template', () => {
    const onApply = vi.fn();

    const setupWithOverrides: WriterPageSetupV2 = {
      ...baseSetup,
      pageTemplate: { kind: 'blank' },
      pageTemplates: {
        1: { kind: 'music-staff', spacing: 7 },
      },
    };

    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={setupWithOverrides}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-page-setup-template-select'), {
      target: { value: 'cornell' },
    });

    fireEvent.click(screen.getByTestId('blank-page-setup-apply-button'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied.pageTemplate?.kind).toBe('cornell');
    expect(applied.pageTemplates?.[1]?.kind).toBe('music-staff');
  });
});
