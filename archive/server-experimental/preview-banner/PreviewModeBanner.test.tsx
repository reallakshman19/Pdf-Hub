import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewModeBanner } from './PreviewModeBanner';
import * as capabilitiesHook from '@/core/capabilities/useCapabilities';

vi.mock('@/core/capabilities/useCapabilities');

describe('PreviewModeBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when mode is server', () => {
    vi.spyOn(capabilitiesHook, 'useCapabilities').mockReturnValue({
      mode: 'server',
      canOpenLocalFile: true,
      canMergeFiles: true,
      canSplitFile: true,
      canRunPreviewOcr: false,
      canRunServerOcr: true,
      canRunMacroApi: true,
      serverVersion: '0.1.0',
      serverLatencyMs: 10,
    });

    const { container } = render(<PreviewModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when mode is preview', () => {
    vi.spyOn(capabilitiesHook, 'useCapabilities').mockReturnValue({
      mode: 'preview',
      canOpenLocalFile: true,
      canMergeFiles: true,
      canSplitFile: true,
      canRunPreviewOcr: true,
      canRunServerOcr: false,
      canRunMacroApi: false,
      serverVersion: null,
      serverLatencyMs: null,
    });

    render(<PreviewModeBanner />);
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByText(/Running in preview mode/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close|dismiss/i })).not.toBeInTheDocument();
  });
});
