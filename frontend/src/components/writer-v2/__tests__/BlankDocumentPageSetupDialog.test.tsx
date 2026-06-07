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
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';
import { BlankDocumentPageSetupDialog } from '../BlankDocumentPageSetupDialog';

describe('BlankDocumentPageSetupDialog', () => {
  it('does not render when closed', () => {
    render(
      <BlankDocumentPageSetupDialog
        open={false}
        pageSetup={WRITER_PAGE_PRESETS.A4}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(screen.queryByTestId('blank-document-page-setup-dialog')).toBeNull();
  });

  it('renders current page setup values', () => {
    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={WRITER_PAGE_PRESETS.Letter}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(screen.getByTestId('blank-document-page-setup-dialog')).toBeTruthy();
    expect(screen.getByTestId('blank-page-setup-preset-select')).toHaveValue('Letter');
    expect(screen.getByTestId('blank-page-setup-width-input')).toHaveValue(612);
    expect(screen.getByTestId('blank-page-setup-height-input')).toHaveValue(792);
    expect(screen.getByTestId('blank-page-setup-margin-top-input')).toHaveValue(72);
  });

  it('applies selected preset and margins', () => {
    const onApply = vi.fn();

    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={WRITER_PAGE_PRESETS.A4}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-page-setup-preset-select'), {
      target: { value: 'Letter' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-margin-top-input'), {
      target: { value: '36' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-margin-right-input'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-margin-bottom-input'), {
      target: { value: '44' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-margin-left-input'), {
      target: { value: '48' },
    });

    fireEvent.click(screen.getByTestId('blank-page-setup-apply-button'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({
      preset: 'Letter',
      width: 612,
      height: 792,
      marginTop: 36,
      marginRight: 40,
      marginBottom: 44,
      marginLeft: 48,
    });
  });

  it('switches to custom when dimensions are edited', () => {
    const onApply = vi.fn();

    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={WRITER_PAGE_PRESETS.A4}
        onCancel={() => undefined}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-page-setup-width-input'), {
      target: { value: '500' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-height-input'), {
      target: { value: '700' },
    });
    fireEvent.click(screen.getByTestId('blank-page-setup-apply-button'));

    expect(onApply.mock.calls[0][0].preset).toBe('Custom');
    expect(onApply.mock.calls[0][0].width).toBe(500);
    expect(onApply.mock.calls[0][0].height).toBe(700);
  });

  it('calls cancel', () => {
    const onCancel = vi.fn();

    render(
      <BlankDocumentPageSetupDialog
        open
        pageSetup={WRITER_PAGE_PRESETS.A4}
        onCancel={onCancel}
        onApply={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('blank-page-setup-cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
