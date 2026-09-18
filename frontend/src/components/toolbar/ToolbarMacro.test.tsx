import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { useEditorStore } from '@/core/editor/store';
import { ToolbarMacro } from './ToolbarMacro';

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

describe('ToolbarMacro', () => {
  beforeEach(() => {
    useEditorStore.setState({
      sidebarTab: 'thumbnails',
      leftPanelWidth: 0,
    });
  });

  it('exposes only one user-facing Automate entry and opens its sidebar', () => {
    render(<ToolbarMacro />);

    expect(screen.getByRole('button', { name: 'Automate' })).toBeInTheDocument();
    expect(screen.queryByText('Macro Panel')).toBeNull();
    expect(screen.queryByText('Rotate 90')).toBeNull();
    expect(screen.queryByText('Page Numbers')).toBeNull();
    expect(screen.queryByText('Built-ins')).toBeNull();

    fireEvent.click(screen.getByTestId('open-automate'));

    expect(useEditorStore.getState().sidebarTab).toBe('macros');
    expect(useEditorStore.getState().leftPanelWidth).toBe(20);
  });
});
