import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));

vi.mock('@/components/workspace/DocumentWorkspace', () => ({
  DocumentWorkspace: () => <div>Open a PDF to begin</div>,
}));

vi.mock('@/components/sidebar/SidebarPanel', () => ({
  SidebarPanel: () => <div>Sidebar</div>,
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    mode: 'static' as const,
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
    hasPreviewOcr: true,
    hasMacroConsole: false,
    hasServerAnnotations: false,
    latencyMs: null,
  }),
}));

describe('App in static mode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('loads without calling fetch', () => {
    render(<App />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows static mode banner', () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /static mode/i,
    );
  });

  it('does not render server-only OCR button', () => {
    render(<App />);
    expect(screen.queryByText(/server.*ocr/i)).toBeNull();
  });
});
