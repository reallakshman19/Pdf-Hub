import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BlankDocumentCreateDialog } from '../BlankDocumentCreateDialog';

describe('BlankDocumentCreateDialog — Templates', () => {
  it('renders template selector with Blank Canvas as default', () => {
    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={() => undefined}
      />,
    );

    const templateSelect = screen.getByTestId('blank-document-template-select');
    expect(templateSelect).toBeInTheDocument();
    expect(templateSelect).toHaveValue('blank');
    expect(screen.queryByTestId('blank-document-template-spacing-input')).toBeNull();
  });

  it('reveals spacing input when ruled notebook is selected', () => {
    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={() => undefined}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-template-select'), {
      target: { value: 'ruled' },
    });

    const spacingInput = screen.getByTestId('blank-document-template-spacing-input');
    expect(spacingInput).toBeInTheDocument();
    expect(spacingInput).toHaveValue(24);

    expect(screen.getByTestId('blank-document-page-summary')).toHaveTextContent('Ruled Notebook');
  });

  it('submits selected template and custom spacing in onCreate payload', () => {
    const onCreate = vi.fn();

    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-template-select'), {
      target: { value: 'grid' },
    });

    const spacingInput = screen.getByTestId('blank-document-template-spacing-input');
    fireEvent.change(spacingInput, {
      target: { value: '30' },
    });

    fireEvent.click(screen.getByTestId('blank-document-create-button'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const { pageSetup } = onCreate.mock.calls[0][0];
    expect(pageSetup.pageTemplate).toBeDefined();
    expect(pageSetup.pageTemplate?.kind).toBe('grid');
    expect(pageSetup.pageTemplate?.spacing).toBe(30);
  });

  it('supports selecting Cornell Notes and Music Manuscript templates', () => {
    const onCreate = vi.fn();

    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-template-select'), {
      target: { value: 'cornell' },
    });
    expect(screen.getByTestId('blank-document-page-summary')).toHaveTextContent('Cornell Notes');

    fireEvent.change(screen.getByTestId('blank-document-template-select'), {
      target: { value: 'music-staff' },
    });
    expect(screen.getByTestId('blank-document-page-summary')).toHaveTextContent('Music Manuscript');

    fireEvent.click(screen.getByTestId('blank-document-create-button'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const { pageSetup } = onCreate.mock.calls[0][0];
    expect(pageSetup.pageTemplate?.kind).toBe('music-staff');
    expect(pageSetup.pageTemplate?.spacing).toBe(7);
  });
});
