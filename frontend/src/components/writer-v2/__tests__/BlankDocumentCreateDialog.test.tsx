import React from 'react';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  BlankDocumentCreateDialog,
  resolveDialogPageSetup,
} from '../BlankDocumentCreateDialog';

describe('BlankDocumentCreateDialog', () => {
  it('does not render when closed', () => {
    render(
      <BlankDocumentCreateDialog
        open={false}
        onCancel={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(screen.queryByTestId('blank-document-create-dialog')).toBeNull();
  });

  it('renders default controls', () => {
    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={() => undefined}
      />,
    );

    expect(screen.getByTestId('blank-document-create-dialog')).toBeTruthy();
    expect(screen.getByText('New blank document')).toBeTruthy();
    expect(screen.getByTestId('blank-document-title-input')).toHaveValue('Untitled document');
    expect(screen.getByTestId('blank-document-preset-select')).toHaveValue('A4');
    expect(screen.getByTestId('blank-document-page-count-input')).toHaveValue(1);
  });

  it('creates document with selected settings', () => {
    const onCreate = vi.fn();

    render(
      <BlankDocumentCreateDialog
        open
        onCancel={() => undefined}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-title-input'), {
      target: { value: 'Doc Hub Plan' },
    });
    fireEvent.change(screen.getByTestId('blank-document-preset-select'), {
      target: { value: 'Letter' },
    });
    fireEvent.change(screen.getByTestId('blank-document-orientation-select'), {
      target: { value: 'landscape' },
    });
    fireEvent.change(screen.getByTestId('blank-document-margin-select'), {
      target: { value: 'narrow' },
    });
    fireEvent.change(screen.getByTestId('blank-document-page-count-input'), {
      target: { value: '3' },
    });

    fireEvent.click(screen.getByTestId('blank-document-create-button'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0].title).toBe('Doc Hub Plan');
    expect(onCreate.mock.calls[0][0].pageCount).toBe(3);
    expect(onCreate.mock.calls[0][0].pageSetup.preset).toBe('Letter');
    expect(onCreate.mock.calls[0][0].pageSetup.width).toBe(792);
    expect(onCreate.mock.calls[0][0].pageSetup.height).toBe(612);
    expect(onCreate.mock.calls[0][0].pageSetup.marginLeft).toBe(36);
  });

  it('cancels when cancel button is clicked', () => {
    const onCancel = vi.fn();

    render(
      <BlankDocumentCreateDialog
        open
        onCancel={onCancel}
        onCreate={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('blank-document-cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('resolves custom page setup', () => {
    const setup = resolveDialogPageSetup({
      preset: 'Custom',
      orientation: 'portrait',
      marginPreset: 'custom',
      customWidth: 400,
      customHeight: 600,
      customMargin: 24,
    });

    expect(setup.preset).toBe('Custom');
    expect(setup.width).toBe(400);
    expect(setup.height).toBe(600);
    expect(setup.marginTop).toBe(24);
    expect(setup.marginRight).toBe(24);
    expect(setup.marginBottom).toBe(24);
    expect(setup.marginLeft).toBe(24);
  });
});
