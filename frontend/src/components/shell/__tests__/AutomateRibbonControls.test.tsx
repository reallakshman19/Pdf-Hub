import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomateRibbonControls } from '@/components/shell/AutomateRibbonControls';
import { useEditorStore } from '@/core/editor/store';
import * as sessionRunner from '@/core/macro/sessionRunner';
import * as macroValidator from '@/core/macro/validation/validator';
import { createPageGraph } from '@/core/pages/pageGraph';
import type { PageId } from '@/core/pages/types';
import { useSessionStore } from '@/core/session/store';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mocks.execute,
  },
}));

vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));

describe('AutomateRibbonControls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ success: true, mutated: true, message: 'done' });
    useEditorStore.setState({
      sidebarTab: 'thumbnails',
      leftPanelWidth: 0,
      macroBuilderOpen: false,
      macroBuilderSource: null,
    });
    const graph = createPageGraph([
      {
        pageId: 'page-1' as PageId,
        documentKey: 'sha256:auto',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 612,
        height: 792,
        rotation: 0,
      },
    ]);
    useSessionStore.setState({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'sha256:auto',
      fileName: 'sample.pdf',
      pageCount: 1,
      pageGraph: graph,
      selectedPages: [],
      selectedPageIds: [],
      viewState: {
        currentPageId: 'page-1' as PageId,
        currentPage: 1,
        zoom: 100,
        fitMode: 'manual',
        viewMode: 'continuous',
      },
    });
  });

  it('opens Macro Builder drawer and Automate sidebar from ribbon and Workflows dropdown', () => {
    render(<AutomateRibbonControls />);

    fireEvent.click(screen.getByTestId('automate-open-macro-studio'));
    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
    expect(useEditorStore.getState().macroBuilderSource).toBe('new');

    useEditorStore.setState({ macroBuilderOpen: false, macroBuilderSource: null });

    fireEvent.click(screen.getByTestId('automate-open-panel'));
    expect(useEditorStore.getState().sidebarTab).toBe('macros');
    expect(useEditorStore.getState().leftPanelWidth).toBe(20);

    useEditorStore.setState({ sidebarTab: 'thumbnails', leftPanelWidth: 0 });
    fireEvent.click(screen.getByTestId('automate-workflows-dropdown'));
    fireEvent.click(screen.getByTestId('automate-dropdown-open-panel'));
    expect(useEditorStore.getState().sidebarTab).toBe('macros');
    expect(useEditorStore.getState().leftPanelWidth).toBe(20);

    fireEvent.click(screen.getByTestId('automate-workflows-dropdown'));
    fireEvent.click(screen.getByTestId('automate-dropdown-open-builder'));
    expect(useEditorStore.getState().macroBuilderOpen).toBe(true);
  });

  it('dispatches Rotate 90° and runs Page Numbers built-in from ribbon buttons', async () => {
    const validateSpy = vi.spyOn(macroValidator, 'validateRecipeBeforeRun').mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: [],
      dryRunLogs: [],
    });
    const runSpy = vi.spyOn(sessionRunner, 'runMacroRecipeAgainstSession').mockResolvedValue({
      status: 'success',
      success: true,
      outputFiles: [],
      stepResults: [],
      finalBytes: new Uint8Array([1, 2, 3]),
      logs: ['ok'],
      selectedPages: [],
    });

    render(<AutomateRibbonControls />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('automate-rotate-90-btn'));
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0]![0].command.type).toBe('ROTATE_PAGES');

    await act(async () => {
      fireEvent.click(screen.getByTestId('automate-page-numbers-btn'));
    });
    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'footer-page-numbers', dryRun: false }),
      expect.objectContaining({ saveOutputs: true }),
    );
  });

  it('opens customizable built-in dialog from Workflows menu and dispatches command on apply', async () => {
    render(<AutomateRibbonControls />);

    fireEvent.click(screen.getByTestId('automate-workflows-dropdown'));
    fireEvent.click(screen.getByTestId('automate-custom-textStamp'));

    expect(screen.getByText('Batch Text Stamp')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const arg = mocks.execute.mock.calls[0]![0];
    expect(arg.command.type).toBe('DRAW_TEXT_ON_PAGES');
  });
});
