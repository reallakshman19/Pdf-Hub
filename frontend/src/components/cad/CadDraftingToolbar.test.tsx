import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CadDraftingToolbar } from './CadDraftingToolbar';
import { useEditorStore } from '@/core/editor/store';

describe('CadDraftingToolbar', () => {
  beforeEach(() => {
    useEditorStore.setState({
      cadGridMode: 'none',
      cadIsoplane: 'all',
      cadGridSnap: false,
      cadGridSpacing: 20,
    });
  });

  it('cycles grid mode through none -> ortho -> isometric -> none', () => {
    render(<CadDraftingToolbar />);

    const gridBtn = screen.getByTestId('cad-grid-mode-btn');
    expect(gridBtn).toHaveTextContent(/grid off/i);

    // Click 1: Ortho
    fireEvent.click(gridBtn);
    expect(useEditorStore.getState().cadGridMode).toBe('ortho');
    expect(gridBtn).toHaveTextContent(/ortho/i);

    // Click 2: Isometric
    fireEvent.click(gridBtn);
    expect(useEditorStore.getState().cadGridMode).toBe('isometric');
    expect(gridBtn).toHaveTextContent(/isometric/i);

    // Click 3: None
    fireEvent.click(gridBtn);
    expect(useEditorStore.getState().cadGridMode).toBe('none');
  });

  it('toggles grid snapping on and off', () => {
    render(<CadDraftingToolbar />);

    const snapBtn = screen.getByTestId('cad-grid-snap-btn');
    expect(useEditorStore.getState().cadGridSnap).toBe(false);

    fireEvent.click(snapBtn);
    expect(useEditorStore.getState().cadGridSnap).toBe(true);

    fireEvent.click(snapBtn);
    expect(useEditorStore.getState().cadGridSnap).toBe(false);
  });

  it('shows isoplane toggle button when grid is isometric and cycles with F5 key', () => {
    useEditorStore.setState({ cadGridMode: 'isometric', cadIsoplane: 'all' });
    render(<CadDraftingToolbar />);

    const isoBtn = screen.getByTestId('cad-isoplane-btn');
    expect(isoBtn).toBeInTheDocument();
    expect(isoBtn).toHaveTextContent(/iso all/i);

    // Clicking cycles through all -> top -> right -> left
    fireEvent.click(isoBtn);
    expect(useEditorStore.getState().cadIsoplane).toBe('top');

    // Pressing F5 also cycles
    fireEvent.keyDown(window, { key: 'F5' });
    expect(useEditorStore.getState().cadIsoplane).toBe('right');
  });
});
