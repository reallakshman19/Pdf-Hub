import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/core/session/store';
import { useHistoryStore } from '@/core/document-history/store';
import { ToolbarOrganize } from './ToolbarOrganize';

vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

describe('ToolbarOrganize More organize tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHistoryStore.setState({ undoStack: [], redoStack: [] });
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sha256:organize-test',
      fileName: 'sample.pdf',
      pageCount: 3,
      selectedPages: [1],
      viewState: {
        currentPageId: null,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
  });

  it('opens the More menu and launches Bates Numbering, Crop Margins, and Normalize Page Size dialogs', () => {
    render(<ToolbarOrganize />);

    fireEvent.click(screen.getByTestId('toolbar-organize-more-btn'));
    expect(screen.getByTestId('toolbar-organize-more-menu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('organize-menu-bates'));
    expect(screen.getByText(/Bates Numbering/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByTestId('toolbar-organize-more-btn'));
    fireEvent.click(screen.getByTestId('organize-menu-crop'));
    expect(screen.getByText('Crop Page Margins / Trim Border Whitespace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByTestId('toolbar-organize-more-btn'));
    fireEvent.click(screen.getByTestId('organize-menu-normalize'));
    expect(screen.getByText(/Normalize Page Dimensions/i)).toBeInTheDocument();
  });

  it('responds to pdf-hub:organize-action custom events for Command Palette shortcuts', () => {
    render(<ToolbarOrganize />);

    act(() => {
      document.dispatchEvent(new CustomEvent('pdf-hub:organize-action', { detail: 'crop' }));
    });
    expect(screen.getByText('Crop Page Margins / Trim Border Whitespace')).toBeInTheDocument();
  });
});
