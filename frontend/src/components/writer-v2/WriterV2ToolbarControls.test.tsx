import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { WriterV2ToolbarControls } from './WriterV2ToolbarControls';
import { runWriterRichToolbarAction } from '@/core/writer-v2/writerRichToolbarActions';

vi.mock('@/core/writer-v2/export/exportCurrentWriterPdf', () => ({
  exportCurrentWriterPdf: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/exportCurrentWriterProject', () => ({
  exportCurrentWriterProject: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/exportCurrentWriterRoundTripPdf', () => ({
  exportCurrentWriterRoundTripPdf: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/exportCurrentWriterDocx', () => ({
  exportCurrentWriterDocx: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/projectImportController', () => ({
  importProjectIntoWriterStore: vi.fn(),
  importRoundTripPdfIntoWriterStore: vi.fn(),
}));

vi.mock('@/core/writer-v2/writerRichToolbarActions', () => ({
  runWriterRichToolbarAction: vi.fn(() => Promise.resolve({ changed: true, id: 'box-1', message: 'Action complete' })),
}));


describe('WriterV2ToolbarControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.setState({ activeMode: 'annotate' });
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
    });
  });

  it('triggers mainRichBox action on Writer Box click for PDF overlay documents', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /Writer Box/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('mainRichBox');
  });

  it('triggers calloutSnippet action on Callout click for PDF overlay documents', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Callout$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('calloutSnippet');
  });

  it('triggers stampSnippet action on Stamp click for PDF overlay documents', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Stamp$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('stampSnippet');
  });

  it('triggers reviewSnippet action on Review click for PDF overlay documents', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Review$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('reviewSnippet');
  });

  it('triggers noteSnippet action on Note click for PDF overlay documents', async () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /^Note$/i });
    fireEvent.click(button);

    expect(runWriterRichToolbarAction).toHaveBeenCalledWith('noteSnippet');
  });

  it('creates a blank Writer document from toolbar dialog', () => {
    useSessionStore.getState().clearDocument();

    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /blank doc/i }));

    expect(screen.getByTestId('blank-document-create-dialog')).toBeTruthy();

    fireEvent.change(screen.getByTestId('blank-document-title-input'), {
      target: { value: 'Doc Hub Draft' },
    });
    fireEvent.change(screen.getByTestId('blank-document-preset-select'), {
      target: { value: 'Letter' },
    });
    fireEvent.change(screen.getByTestId('blank-document-page-count-input'), {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByTestId('blank-document-create-button'));

    const state = useWriterV2Store.getState();

    expect(state.documentMeta?.mode).toBe('blankDocument');
    expect(state.documentMeta?.title).toBe('Doc Hub Draft');
    expect(state.documentMeta?.pageSetup.preset).toBe('Letter');
    expect(state.documentMeta?.pageCount).toBe(2);
    expect(useEditorStore.getState().activeMode).toBe('write');
  });

  it('uses Writer Box as placement tool in blank document mode', () => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-toolbar',
    });

    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /writer box/i }));

    expect(runWriterRichToolbarAction).not.toHaveBeenCalled();
    expect(useWriterV2Store.getState().activeWriterTool).toBe('richTextBox');
    expect(useEditorStore.getState().activeMode).toBe('write');
  });

  it('uses Callout as placement tool in blank document mode', () => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-toolbar',
    });

    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /^Callout$/i }));

    expect(runWriterRichToolbarAction).not.toHaveBeenCalled();
    expect(useWriterV2Store.getState().activeWriterTool).toBe('textCallout');
    expect(useEditorStore.getState().activeMode).toBe('write');
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

  it('disables export buttons when no PDF or blank document is open', () => {
    useSessionStore.getState().clearDocument();
    render(<WriterV2ToolbarControls />);

    expect(screen.getByRole('button', { name: /docx/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /flatten/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save project/i })).toBeDisabled();
  });

  it('enables DOCX for blank documents but keeps PDF-only exports disabled', () => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-doc-toolbar',
    });

    render(<WriterV2ToolbarControls />);

    expect(screen.getByRole('button', { name: /docx/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /flatten/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save project/i })).toBeDisabled();
  });

  it('renders import project file input', () => {
    render(<WriterV2ToolbarControls />);

    expect(screen.getByLabelText(/import editable writer project or pdf/i)).toBeTruthy();
  });
});
