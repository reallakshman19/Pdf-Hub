import { describe, expect, it, vi } from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';
import type { ReactNode } from 'react';

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    mode: 'server',
    serverAlive: true,
    hasServerOcr: true,
    hasPreviewOcr: true,
    hasMacroConsole: true,
    hasServerAnnotations: true,
    latencyMs: 1,
  }),
}));

describe('App slice 11 routing', () => {
  it('routes to macro builder page through hash route', () => {
    window.location.hash = '#/macro-builder';

    render(<App />);

    expect(screen.getByRole('main', { name: 'Macro builder page' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Macro recipe builder' })).toBeInTheDocument();
  });
});