import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterV2ToolbarControls } from './WriterV2ToolbarControls';

vi.mock('@/core/writer-v2/export/exportCurrentWriterPdf', () => ({
  exportCurrentWriterPdf: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/exportCurrentWriterProject', () => ({
  exportCurrentWriterProject: vi.fn(),
}));

vi.mock('@/core/writer-v2/export/projectImportController', () => ({
  importProjectIntoWriterStore: vi.fn(),
}));

describe('WriterV2ToolbarControls', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('sets Writer V2 rich text placement tool', () => {
    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /w2 text/i }));

    expect(useWriterV2Store.getState().activeWriterTool).toBe('richTextBox');
  });

  it('sets Writer V2 callout placement tool', () => {
    render(<WriterV2ToolbarControls />);

    fireEvent.click(screen.getByRole('button', { name: /w2 callout/i }));

    expect(useWriterV2Store.getState().activeWriterTool).toBe('textCallout');
  });

  it('toggles active Writer V2 placement tool back to select', () => {
    render(<WriterV2ToolbarControls />);

    const button = screen.getByRole('button', { name: /w2 text/i });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(useWriterV2Store.getState().activeWriterTool).toBe('select');
  });

  it('disables export buttons when no PDF is open', () => {
    render(<WriterV2ToolbarControls />);

    expect(screen.getByRole('button', { name: /export pdf/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /export project/i })).toBeDisabled();
  });

  it('renders import project file input', () => {
    render(<WriterV2ToolbarControls />);

    expect(screen.getByLabelText(/import pdf hub project file/i)).toBeTruthy();
  });
});