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

vi.mock('./MacrosSidebar', () => ({
  MacrosSidebar: () => <div data-testid="legacy-macro-tools">Legacy macro tools</div>,
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

    expect(screen.queryByTestId('ps-specialized-workflow')).toBeNull();
    expect(screen.queryByTestId('legacy-macro-tools')).toBeNull();
    expect(screen.queryByText('Macro Panel')).toBeNull();
    expect(screen.queryByText('Built-ins')).toBeNull();
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

  it('mounts specialized and legacy tools only after their disclosure is opened', () => {
    render(<AutomateSidebar />);

    fireEvent.click(screen.getByText('Specialized workflows'));
    expect(screen.getByTestId('ps-specialized-workflow')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Advanced macro tools'));
    expect(screen.getByTestId('legacy-macro-tools')).toBeInTheDocument();
  });
});
