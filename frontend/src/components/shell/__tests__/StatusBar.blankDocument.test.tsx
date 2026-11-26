import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from '../StatusBar';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useEditorStore } from '@/core/editor/store';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';

describe('StatusBar Blank Canvas coherence', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.setState({ activeMode: 'write' });
  });

  it('displays accurate page count and current page when a Blank Canvas document is active', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-status-test',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 4,
    });

    render(<StatusBar />);

    expect(screen.getByText('4 pages')).toBeInTheDocument();
    const input = screen.getByLabelText(/Page 1 of 4/i) as HTMLInputElement;
    expect(input).not.toBeDisabled();
    expect(input.value).toBe('1');
  });

  it('allows jumping between Blank Canvas pages from the StatusBar page input', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-jump-test',
      pageSetup: WRITER_PAGE_PRESETS.Letter,
      pageCount: 5,
    });

    render(<StatusBar />);
    const input = screen.getByLabelText(/Page 1 of 5/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useWriterV2Store.getState().activeBlankPage).toBe(3);
  });

  it('shows dash indicator when neither a PDF nor a Blank Canvas is loaded', () => {
    render(<StatusBar />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
