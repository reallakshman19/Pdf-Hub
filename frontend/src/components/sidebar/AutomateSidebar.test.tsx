import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { upsertCustomMacroRecipe } from '@/core/macro/recipes/recipeStorage';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { AutomateSidebar } from './AutomateSidebar';

const mockCommandExecute = vi.hoisted(() => vi.fn());

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

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mockCommandExecute,
  },
}));

vi.mock('./PsIsonoteRecipeBuilder', () => ({
  PsIsonoteRecipeBuilder: ({
    onBusyChange,
  }: {
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <div data-testid="ps-specialized-workflow">
      PS workflow
      <button type="button" onClick={() => onBusyChange?.(true)}>
        Start PS work
      </button>
      <button type="button" onClick={() => onBusyChange?.(false)}>
        Finish PS work
      </button>
    </div>
  ),
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
      pageGraph: {
        pages: [1, 2, 3].map((pageNumber, index) => ({
          pageId: `automate-doc::page::${pageNumber}`,
          documentKey: 'automate-doc',
          originalPageNumber: pageNumber,
          currentIndex: index,
          width: 595,
          height: 842,
          rotation: 0 as const,
        })),
      },
    });
    mockCommandExecute.mockResolvedValue({
      success: true,
      commandId: 'page-labels',
      commandType: 'SET_PAGE_LABELS',
      source: 'macro-runner',
      mutated: true,
      message: 'Logical page labels updated',
    });
  });

  it('starts with curated Quick Actions and keeps specialized tools collapsed', () => {
    render(<AutomateSidebar />);

    expect(screen.getByTestId('automate-quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('automate-header-footer')).toBeInTheDocument();
    expect(screen.queryByText('Footer Page Numbers')).toBeNull();
    expect(screen.queryByText('Header File Name')).toBeNull();
    expect(screen.getByText('Rotate Selected Pages 90°')).toBeInTheDocument();

    expect(screen.getByTestId('automate-generate-document')).toBeInTheDocument();
    expect(screen.getByTestId('automate-batch-run')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Generator' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Workflow' })).toBeInTheDocument();

    expect(screen.queryByTestId('ps-specialized-workflow')).toBeNull();
    expect(screen.queryByText('Advanced macro tools')).toBeNull();
    expect(screen.queryByText('Macro Panel')).toBeNull();
    expect(screen.queryByText('Built-ins')).toBeNull();
  });

  it('opens the professional Header & Footer editor from Automate without a macro recipe', () => {
    render(<AutomateSidebar />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Configure printed content',
      }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Header & Footer' }),
    ).toBeInTheDocument();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('configures logical Page Labels through the canonical command bus', async () => {
    render(<AutomateSidebar />);

    expect(screen.getByTestId('automate-page-labels')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configure labels' }));
    expect(screen.getByRole('dialog', { name: 'Logical Page Labels' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply restart' }));

    await waitFor(() => {
      expect(mockCommandExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: 'SET_PAGE_LABELS',
            source: 'macro-runner',
            documentKey: 'automate-doc',
            payload: {
              ranges: [{
                startPageId: 'automate-doc::page::1',
                style: 'decimal',
                startNumber: 1,
              }],
            },
          }),
        }),
      );
    });
    expect(runMock).not.toHaveBeenCalled();
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

    const card = screen.getByText('Insert Review Cover Page').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(runMock).toHaveBeenCalledTimes(1);
    });

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'insert-review-cover',
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

    const card = screen.getByText('Insert Review Cover Page').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Customize' }));

    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
    expect(useEditorStore.getState().macroBuilderSource).toBe('builtin:insert-review-cover');
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

  it('locks standard workflow launches while Specialized workflows is open', () => {
    render(<AutomateSidebar />);

    fireEvent.click(screen.getByText('Specialized workflows'));

    const quickAction = screen.getByText('Insert Review Cover Page').closest('article');
    expect(quickAction).not.toBeNull();
    expect(
      within(quickAction as HTMLElement).getByRole('button', { name: 'Run' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Generator' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose Workflow' })).toBeDisabled();

    fireEvent.click(screen.getByText('Specialized workflows'));

    expect(
      within(quickAction as HTMLElement).getByRole('button', { name: 'Run' }),
    ).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Generator' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose Workflow' })).not.toBeDisabled();
  });

  it('keeps Generate Document mounted by locking Automate tabs while generation runs', async () => {
    type SessionRunResult = Awaited<
      ReturnType<typeof runMacroRecipeAgainstSession>
    >;
    let resolveGeneration: ((value: SessionRunResult) => void) | undefined;

    runMock.mockImplementationOnce(
      () =>
        new Promise<SessionRunResult>((resolve) => {
          resolveGeneration = resolve;
        }),
    );

    render(<AutomateSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Generator' }));
    fireEvent.click(screen.getByTestId('macro-generate-run'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'My Workflows' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Close Generator' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Choose Workflow' })).toBeDisabled();
    });

    fireEvent.click(screen.getByText('Specialized workflows'));
    expect(screen.queryByTestId('ps-specialized-workflow')).toBeNull();

    resolveGeneration?.({
      success: true,
      status: 'success',
      outputFiles: [],
      logs: ['generated'],
      finalBytes: new Uint8Array([4, 5, 6]),
      selectedPages: [],
      stepResults: [],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'My Workflows' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Build' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Close Generator' })).not.toBeDisabled();
    });
  });

  it('keeps Specialized workflows mounted and navigation locked while specialized work is active', () => {
    render(<AutomateSidebar />);

    fireEvent.click(screen.getByText('Specialized workflows'));
    fireEvent.click(screen.getByRole('button', { name: 'Start PS work' }));

    expect(screen.getByRole('button', { name: 'My Workflows' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();

    fireEvent.click(screen.getByText('Specialized workflows'));
    expect(screen.getByTestId('ps-specialized-workflow')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish PS work' }));
    expect(screen.getByRole('button', { name: 'My Workflows' })).not.toBeDisabled();

    fireEvent.click(screen.getByText('Specialized workflows'));
    expect(screen.queryByTestId('ps-specialized-workflow')).toBeNull();
  });

  it('keeps specialized workflows available without restoring the legacy Advanced surface', () => {
    render(<AutomateSidebar />);

    fireEvent.click(screen.getByText('Specialized workflows'));

    expect(screen.getByTestId('ps-specialized-workflow')).toBeInTheDocument();
    expect(screen.queryByText('Advanced macro tools')).toBeNull();
    expect(screen.queryByText('Legacy macro tools')).toBeNull();
  });
});
