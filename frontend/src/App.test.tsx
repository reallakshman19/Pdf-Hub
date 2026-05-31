import { render, screen } from '@testing-library/react';
import App from './App';
import { vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div></div>,
}));
vi.mock('@/components/workspace/DocumentWorkspace', () => ({
  DocumentWorkspace: () => <div>Open a PDF to begin</div>,
}));
vi.mock('@/components/sidebar/SidebarPanel', () => ({
  SidebarPanel: () => <div>Sidebar</div>,
}));

test('renders Workspace page by default', () => {
  render(<App />);
  expect(screen.getByText(/Open a PDF to begin/i)).toBeInTheDocument();
});
