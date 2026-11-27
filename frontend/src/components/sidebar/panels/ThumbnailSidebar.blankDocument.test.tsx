import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThumbnailSidebar from './ThumbnailSidebar';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';

describe('ThumbnailSidebar Blank Canvas integration', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders live Blank Canvas page cards when workingBytes is null and blankDocument is active', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-sidebar-test',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 3,
    });

    render(<ThumbnailSidebar />);

    expect(screen.getByTestId('blank-doc-thumbnail-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('blank-thumb-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('blank-thumb-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('blank-thumb-card-3')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('blank-thumb-card-2'));
    expect(useWriterV2Store.getState().activeBlankPage).toBe(2);

    fireEvent.click(screen.getByTestId('blank-thumb-add-page-btn'));
    expect(useWriterV2Store.getState().documentMeta?.pageCount).toBe(4);
    expect(screen.getByTestId('blank-thumb-card-4')).toBeInTheDocument();
  });
});
