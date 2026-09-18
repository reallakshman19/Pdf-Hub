import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModeBar } from './ModeBar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useEditorStore } from '@/core/editor/store';

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}));

describe('ModeBar', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    useEditorStore.setState({
      activeMode: 'annotate',
      sidebarTab: 'thumbnails',
      mobileDrawerOpen: false,
      mobileSheetOpen: true,
    });
  });

  it('returns null (renders nothing) when useIsMobile is false', () => {
    const { container } = render(<ModeBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders scrollable mobile ModeBar when useIsMobile is true', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<ModeBar />);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Annotate')).toBeInTheDocument();
    // Desktop actions like Undo / Redo are omitted on mobile
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();
    expect(screen.queryByText('Redo')).not.toBeInTheDocument();
  });

  it('changes active mode when mobile buttons are clicked', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<ModeBar />);
    
    const fileButton = screen.getByText('File');
    fireEvent.click(fileButton);
    expect(useEditorStore.getState().activeMode).toBe('file');
  });

  it('opens the Automate drawer when the mobile Automate mode is selected', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<ModeBar />);

    fireEvent.click(screen.getByText('Automate'));

    const state = useEditorStore.getState();
    expect(state.activeMode).toBe('generate');
    expect(state.sidebarTab).toBe('macros');
    expect(state.mobileDrawerOpen).toBe(true);
    expect(state.mobileSheetOpen).toBe(false);
  });

  it('enforces touch targets (min-h-[44px]) on mobile buttons', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<ModeBar />);
    
    const buttons = screen.getAllByRole('tab');
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });
  });
});
