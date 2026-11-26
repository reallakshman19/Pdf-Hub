import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VramTelemetryBadge } from '../VramTelemetryBadge';
import { useVramTelemetryStore } from '@/core/renderer/vramTelemetryStore';
import { CanvasDisposalManager } from '@/core/renderer/canvasDisposalManager';

describe('VramTelemetryBadge', () => {
  beforeEach(() => {
    CanvasDisposalManager.resetRegistry();
    useVramTelemetryStore.getState().refreshTelemetry();
  });

  it('renders VRAM badge with formatted memory and canvas count', () => {
    useVramTelemetryStore.getState().setFromSnapshot({
      pageCanvasesCount: 3,
      pageVramBytes: 30 * 1024 * 1024,
      thumbnailCanvasesCount: 2,
      thumbnailVramBytes: 1 * 1024 * 1024,
      otherCanvasesCount: 0,
      otherVramBytes: 0,
      totalCanvasesCount: 5,
      totalVramBytes: 31 * 1024 * 1024,
    });

    render(<VramTelemetryBadge />);

    const badgeButton = screen.getByRole('button', { name: /GPU VRAM:/i });
    expect(badgeButton).toBeInTheDocument();
    expect(badgeButton).toHaveTextContent('31.0 MB (5)');
  });

  it('opens dialog popover on click with detailed breakdown and purge button', () => {
    useVramTelemetryStore.getState().setFromSnapshot({
      pageCanvasesCount: 2,
      pageVramBytes: 20 * 1024 * 1024,
      thumbnailCanvasesCount: 4,
      thumbnailVramBytes: 2 * 1024 * 1024,
      otherCanvasesCount: 0,
      otherVramBytes: 0,
      totalCanvasesCount: 6,
      totalVramBytes: 22 * 1024 * 1024,
    });

    render(<VramTelemetryBadge />);

    const badgeButton = screen.getByRole('button', { name: /GPU VRAM:/i });
    fireEvent.click(badgeButton);

    const dialog = screen.getByRole('dialog', { name: /VRAM Telemetry Details/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('GPU VRAM Telemetry');
    expect(dialog).toHaveTextContent('Page Canvases:');
    expect(dialog).toHaveTextContent('2 active (20.0 MB)');

    // Click purge button
    const purgeButton = screen.getByRole('button', { name: /Purge Inactive Cache/i });
    fireEvent.click(purgeButton);
    expect(screen.getByText('Purged')).toBeInTheDocument();
  });

  it('closes popover on Escape key', () => {
    render(<VramTelemetryBadge />);
    const badgeButton = screen.getByRole('button', { name: /GPU VRAM:/i });
    fireEvent.click(badgeButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
