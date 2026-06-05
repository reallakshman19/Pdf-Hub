import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { WriterV2ToolbarControls } from './WriterV2ToolbarControls';
import { runWriterRichToolbarAction } from '@/core/writer-v2/writerRichToolbarActions';

vi.mock('@/core/writer-v2/export/exportCurrentWriterPdf', () => ({
  exportCurrentWriterPdf: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/exportCurrentWriterProject', () => ({
  exportCurrentWriterProject: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/projectImportController', () => ({
  importProjectIntoWriterStore: vi.fn(),
}));

vi.mock('@/core/writer-v2/writerRichToolbarActions', () => ({
  runWriterRichToolbarAction: vi.fn(() => Promise.resolve({ changed: true, id: 'box-1', message: 'Action complete' })),
}));



describe('WriterV2ToolbarControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
    });
  });

  it('triggers mainRichBox action on Writer Box click', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /Writer Box/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('mainRichBox');
  });

  it('triggers calloutSnippet action on Callout click', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Callout$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('calloutSnippet');
  });

  it('triggers stampSnippet action on Stamp click', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Stamp$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('stampSnippet');
  });

  it('triggers reviewSnippet action on Review click', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Review$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('reviewSnippet');
  });

  it('triggers noteSnippet action on Note click', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Note$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('noteSnippet');
  });



  it('sets Select Box Copy tool', () => {
    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /copy region/i }));

    expect(useWriterV2Store.getState().activeWriterTool).toBe('selectBoxCopy');
  });

  it('toggles Select Box Copy tool back to select', () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /copy region/i });

    fireEvent.click(button);
    expect(useWriterV2Store.getState().activeWriterTool).toBe('selectBoxCopy');

    fireEvent.click(button);
    expect(useWriterV2Store.getState().activeWriterTool).toBe('select');
  });

  it('disables export buttons when no PDF is open', () => {
    useSessionStore.getState().clearDocument();
    render(<WriterV2ToolbarControls />);

    expect(screen.getByRole('button', { name: /flatten/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save project/i })).toBeDisabled();
  });

  it('renders import project file input', () => {
    render(<WriterV2ToolbarControls />);

    expect(screen.getByLabelText(/import editable writer project or pdf/i)).toBeTruthy();
  });
});
