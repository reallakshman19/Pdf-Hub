import { describe, expect, it, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MacroBuilderDrawer } from '../MacroBuilderDrawer';
import { useEditorStore } from '@/core/editor/store';

describe('MacroBuilderDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorStore.setState({
      macroBuilderOpen: false,
      macroBuilderSource: null,
    });
  });

  it('stays unmounted when closed and renders dialog semantics when open', () => {
    const { container } = render(<MacroBuilderDrawer />);
    expect(container.firstChild).toBeNull();

    act(() => {
      useEditorStore.setState({
        macroBuilderOpen: true,
        macroBuilderSource: 'builtin:footer-page-numbers',
      });
    });

    const dialog = screen.getByRole('dialog', { name: 'Workflow Builder' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow Name')).toHaveValue('Footer Page Numbers');
    expect(screen.getByRole('link', { name: 'Open Workflow Builder full page' })).toHaveAttribute(
      'href',
      '#/macro-builder',
    );
  });

  it('closes cleanly on Escape and via the header Close button', () => {
    useEditorStore.setState({
      macroBuilderOpen: true,
      macroBuilderSource: 'new',
    });

    render(<MacroBuilderDrawer />);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useEditorStore.getState().macroBuilderOpen).toBe(false);
    expect(useEditorStore.getState().macroBuilderSource).toBeNull();

    act(() => {
      useEditorStore.setState({
        macroBuilderOpen: true,
        macroBuilderSource: 'new',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close Workflow Builder' }));

    expect(useEditorStore.getState().macroBuilderOpen).toBe(false);
    expect(useEditorStore.getState().macroBuilderSource).toBeNull();
  });
});
