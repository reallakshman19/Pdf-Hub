import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TopNav } from './TopNav';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCapabilities } from '@/hooks/useCapabilities';

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

describe('TopNav — mobile variant', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(useCapabilities).mockReturnValue({
      mode: 'preview',
      serverAlive: false,
      canUseClientPdfTools: true,
      canUseClientAnnotations: true,
      canUseClientWriter: true,
      canUseClientMacros: true,
      canUseServerOcr: false,
      canUseServerAnnotations: false,
      canUseMacroApi: false,
      canProbeServer: false,
      hasServerOcr: false,
      hasPreviewOcr: false,
      hasMacroConsole: false,
      hasServerAnnotations: false,
      latencyMs: null,
    });
  });

  it('renders mobile hamburger button with touch-target class (H3-T2)', () => {
    render(<TopNav />);
    const hamburger = screen.getByTestId('mobile-hamburger');
    expect(hamburger).toBeInTheDocument();
    // min-h-[44px] and min-w-[44px] ensure the 44×44px WCAG touch target
    expect(hamburger.className).toContain('min-h-[44px]');
    expect(hamburger.className).toContain('min-w-[44px]');
  });

  it('does not render desktop search bar in mobile variant', () => {
    render(<TopNav />);
    // Desktop search placeholder text should not appear in the mobile layout
    expect(screen.queryByPlaceholderText(/search or run a command/i)).not.toBeInTheDocument();
  });

  it('does not render avatar or settings button in mobile variant', () => {
    render(<TopNav />);
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
  });
});

describe('TopNav — desktop variant', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.mocked(useCapabilities).mockReturnValue({
      mode: 'preview',
      serverAlive: false,
      canUseClientPdfTools: true,
      canUseClientAnnotations: true,
      canUseClientWriter: true,
      canUseClientMacros: true,
      canUseServerOcr: false,
      canUseServerAnnotations: false,
      canUseMacroApi: false,
      canProbeServer: false,
      hasServerOcr: false,
      hasPreviewOcr: false,
      hasMacroConsole: true,
      hasServerAnnotations: false,
      latencyMs: null,
    });
  });

  it('renders unified desktop single-row header layout', () => {
    render(<TopNav />);
    // Check that modes tabs are rendered
    expect(screen.getByRole('tab', { name: /File/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /View/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Annotate/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Draw/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Write/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Organize/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Generate/i })).toBeInTheDocument();

    // Check that search pill and actions are rendered
    expect(screen.getByPlaceholderText(/search or run command/i)).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });
});
