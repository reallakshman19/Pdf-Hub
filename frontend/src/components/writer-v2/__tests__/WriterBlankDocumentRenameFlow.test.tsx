import React from 'react';
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

describe('WriterBlankDocumentCanvas rename flow', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('shows current title and opens rename dialog', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      title: 'Initial Draft',
      documentFingerprint: 'blank-rename-flow',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    expect(screen.getByTestId('writer-blank-document-title')).toHaveTextContent('Initial Draft');

    fireEvent.click(screen.getByTestId('writer-blank-document-rename-button'));

    expect(screen.getByTestId('blank-document-rename-dialog')).toBeTruthy();
    expect(screen.getByTestId('blank-document-rename-input')).toHaveValue('Initial Draft');
  });

  it('renames the active blank Writer document', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      title: 'Initial Draft',
      documentFingerprint: 'blank-rename-apply',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    fireEvent.click(screen.getByTestId('writer-blank-document-rename-button'));
    fireEvent.change(screen.getByTestId('blank-document-rename-input'), {
      target: { value: '  Renamed   Draft  ' },
    });
    fireEvent.click(screen.getByTestId('blank-document-rename-apply-button'));

    expect(useWriterV2Store.getState().documentMeta?.title).toBe('Renamed Draft');
    expect(useWriterV2Store.getState().dirty).toBe(true);
    expect(screen.queryByTestId('blank-document-rename-dialog')).toBeNull();
    expect(screen.getByTestId('writer-blank-document-title')).toHaveTextContent('Renamed Draft');
  });

  it('cancels rename without changing title', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      title: 'Original Draft',
      documentFingerprint: 'blank-rename-cancel',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(<WriterBlankDocumentCanvas />);

    fireEvent.click(screen.getByTestId('writer-blank-document-rename-button'));
    fireEvent.change(screen.getByTestId('blank-document-rename-input'), {
      target: { value: 'Changed Draft' },
    });
    fireEvent.click(screen.getByTestId('blank-document-rename-cancel-button'));

    expect(useWriterV2Store.getState().documentMeta?.title).toBe('Original Draft');
    expect(screen.queryByTestId('blank-document-rename-dialog')).toBeNull();
    expect(screen.getByTestId('writer-blank-document-title')).toHaveTextContent('Original Draft');
  });
});
