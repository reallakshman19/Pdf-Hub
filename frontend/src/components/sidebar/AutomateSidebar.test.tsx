import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { upsertCustomMacroRecipe } from '@/core/macro/recipes/recipeStorage';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { AutomateSidebar } from './AutomateSidebar';

vi.mock('@/core/macro/sessionRunner', () => ({
  runMacroRecipeAgainstSession: vi.fn().mockResolvedValue({
    success: true,
    status: 'success',
    outputFiles: [],
    logs: ['done'],
    finalBytes: new Uint8Array([1]),
    selectedPages: [],
    stepResults: [],
  }),
}));

vi.mock('./PsIsonoteRecipeBuilder', () => ({
  PsIsonoteRecipeBuilder: () => <div data-testid="ps-specialized-workflow">PS workflow</div>,
}));

const runMock = vi.mocked(runMacroRecipeAgainstSession);

describe('AutomateSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useSessionStore.getState().clearDocument();
    useEditorStore.setState({
      macroBuilderOpen: false,
      macroBuilderSource: null,
      sidebarTab: 'macros',
      leftPanelWidth: 20,
    });

    useSessionStore.getState().openDocument({
      documentKey: 'automate-doc',
      fileName: 'automate.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 3,
    });
  });

  it('starts with curated Quick Actions and keeps specialized tools collapsed', () => {
    render(<AutomateSidebar />);

    expect(screen.getByTestId('automate-quick-actions')).toBeInTheDocument();
    expect(screen.getByText('Footer Page Numbers')).toBeInTheDocument();
    expect(screen.getByText('Rotate Selected Pages 90°')).toBeInTheDocument();

    expect(screen.getByTestId('automate-generate-document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Generator' })).toBeInTheDocument();

    expect(screen.queryByTestId('ps-specialized-workflow')).toBeNull();
    expect(screen.queryByText('Advanced macro tools')).toBeNull();
    expect(screen.queryByText('Macro Panel')).toBeNull();
    expect(screen.queryByText('Built-ins')).toBeNull();
  });

  it('disables selection-dependent quick actions until pages are selected', () => {
    useSessionStore.getState().setSelectedPages([]);

    render(<AutomateSidebar />);

    const rotateCard = screen.getByText('Rotate Selected Pages 90°').closest('article');
    const extractCard = screen.getByText('Extract Selected Pages').closest('article');

    expect(rotateCard).not.toBeNull();
    expect(extractCard).not.toBeNull();
    expect(within(rotateCard as HTMLElement).getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(within(extractCard as HTMLElement).getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getAllByText('Select one or more pages first.')).toHaveLength(2);
  });

  it('preflights and runs a quick action through the shared session runner', async () => {
    render(<AutomateSidebar />);

    const card = screen.getByText('Footer Page Numbers').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'footer-page-numbers',
        dryRun: false,
      }),
      expect.objectContaining({
        saveOutputs: true,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('opens a quick action in the workflow builder for customization', () => {
    render(<AutomateSidebar />);

    const card = screen.getByText('Footer Page Numbers').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Customize' }));

    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
    expect(useEditorStore.getState().macroBuilderSource).toBe('builtin:footer-page-numbers');
  });

  it('lists saved workflows and opens the selected workflow for editing', () => {
    upsertCustomMacroRecipe({
      id: 'saved-workflow',
      name: 'Saved Workflow',
      steps: [
        {
          op: 'select_pages',
          selector: { mode: 'all' },
        },
      ],
    });

    render(<AutomateSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'My Workflows' }));

    const card = screen.getByText('Saved Workflow').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Edit' }));

    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
    expect(useEditorStore.getState().macroBuilderSource).toBe('custom:saved-workflow');
  });

  it('routes destructive saved workflows through Review & Run instead of direct execution', () => {
    upsertCustomMacroRecipe({
      id: 'destructive-workflow',
      name: 'Remove Selected Pages',
      steps: [
        {
          op: 'remove_pages',
          selector: { mode: 'selected' },
        },
      ],
    });

    render(<AutomateSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'My Workflows' }));

    const card = screen.getByText('Remove Selected Pages').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(
      within(card as HTMLElement).getByRole('button', { name: 'Review & Run' }),
    );

    expect(runMock).not.toHaveBeenCalled();
    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
    expect(useEditorStore.getState().macroBuilderSource).toBe('custom:destructive-workflow');
  });

  it('opens Generate Document directly from Quick Actions', () => {
    render(<AutomateSidebar />);

    expect(screen.queryByTestId('macro-generate-document')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open Generator' }));

    expect(screen.getByTestId('macro-generate-document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Generator' })).toBeInTheDocument();
  });

  it('keeps specialized workflows available without restoring the legacy Advanced surface', () => {
    render(<AutomateSidebar />);

    fireEvent.click(screen.getByText('Specialized workflows'));

    expect(screen.getByTestId('ps-specialized-workflow')).toBeInTheDocument();
    expect(screen.queryByText('Advanced macro tools')).toBeNull();
    expect(screen.queryByText('Legacy macro tools')).toBeNull();
  });
});
