import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterBlankDocumentCanvas } from '../WriterBlankDocumentCanvas';

describe('WriterBlankDocumentCanvas page setup flow', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('opens page setup dialog from top controls', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-page-setup-flow',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    expect(screen.queryByTestId('blank-document-page-setup-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('writer-blank-document-page-setup-button'));

    expect(screen.getByTestId('blank-document-page-setup-dialog')).toBeTruthy();
  });

  it('applies page setup changes to Writer store and rendered page size', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-page-setup-apply',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    fireEvent.click(screen.getByTestId('writer-blank-document-page-setup-button'));
    fireEvent.change(screen.getByTestId('blank-page-setup-preset-select'), {
      target: { value: 'Letter' },
    });
    fireEvent.change(screen.getByTestId('blank-page-setup-margin-left-input'), {
      target: { value: '36' },
    });
    fireEvent.click(screen.getByTestId('blank-page-setup-apply-button'));

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.pageSetup.preset).toBe('Letter');
    expect(state.documentMeta?.pageSetup.width).toBe(612);
    expect(state.documentMeta?.pageSetup.height).toBe(792);
    expect(state.documentMeta?.pageSetup.marginLeft).toBe(36);
    expect(screen.queryByTestId('blank-document-page-setup-dialog')).toBeNull();
    expect(screen.getByText(/612 × 792 pt/i)).toBeTruthy();
  });

  it('cancels page setup without changing store', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-page-setup-cancel',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    fireEvent.click(screen.getByTestId('writer-blank-document-page-setup-button'));
    fireEvent.change(screen.getByTestId('blank-page-setup-width-input'), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByTestId('blank-page-setup-cancel-button'));

    expect(useWriterV2Store.getState().documentMeta?.pageSetup.preset).toBe('A4');
    expect(useWriterV2Store.getState().documentMeta?.pageSetup.width).toBe(595.28);
    expect(screen.queryByTestId('blank-document-page-setup-dialog')).toBeNull();
  });
});
