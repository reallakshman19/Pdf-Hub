import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMacroRecipeAgainstSession } from './sessionRunner';
import { useSessionStore } from '@/core/session/store';

const mockExecuteMacroRecipe = vi.hoisted(() => vi.fn());
const mockDispatchCommand = vi.hoisted(() => vi.fn());
const mockSavePdfBytes = vi.hoisted(() => vi.fn());

vi.mock('./executor', () => ({
  executeMacroRecipe: mockExecuteMacroRecipe,
}));

vi.mock('@/core/commands/dispatch', () => ({
  dispatchCommand: mockDispatchCommand,
}));

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    savePdfBytes: mockSavePdfBytes,
  },
}));

describe('runMacroRecipeAgainstSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().openDocument({
      documentKey: 'macro-doc',
      fileName: 'macro.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 3,
    });
    useSessionStore.getState().setSelectedPages([1, 2]);
    mockExecuteMacroRecipe.mockResolvedValue({
      finalBytes: new Uint8Array([4, 5, 6]),
      pageCount: 3,
      selectedPages: [2],
      logs: ['ok'],
      outputFiles: [],
      stepResults: [],
    });
    mockDispatchCommand.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('throws when session has no active document', async () => {
    useSessionStore.getState().clearDocument();
    await expect(
      runMacroRecipeAgainstSession({ id: 'r1', name: 'R1', steps: [] }),
    ).rejects.toThrow('No active document in session');
  });

  it('calls replaceWorkingCopy for normal runs', async () => {
    await runMacroRecipeAgainstSession({ id: 'r2', name: 'R2', steps: [] });

    expect(useSessionStore.getState().selectedPages).toEqual([2]);
  });

  it('saves extracted outputs when saveOutputs is true', async () => {
    mockExecuteMacroRecipe.mockResolvedValue({
      finalBytes: new Uint8Array([4, 5, 6]),
      pageCount: 3,
      selectedPages: [2],
      logs: ['ok'],
      outputFiles: [{ name: 'out.pdf', bytes: new Uint8Array([9]) }],
      stepResults: [],
    });

    await runMacroRecipeAgainstSession({ id: 'r4', name: 'R4', steps: [] }, { saveOutputs: true });
    expect(mockSavePdfBytes).toHaveBeenCalledWith(new Uint8Array([9]), 'out.pdf', null);
  });
  it('queues concurrent macro runs against the session', async () => {
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      mockExecuteMacroRecipe.mockImplementationOnce(async () => {
        resolve();
        await new Promise<void>((release) => {
          releaseFirst = release;
        });
        return {
          finalBytes: new Uint8Array([7]),
          selectedPages: [1],
          logs: ['first'],
          outputFiles: [],
          stepResults: [],
        };
      });
    });
    mockExecuteMacroRecipe.mockResolvedValueOnce({
      finalBytes: new Uint8Array([8]),
      selectedPages: [2],
      logs: ['second'],
      outputFiles: [],
      stepResults: [],
    });

    const first = runMacroRecipeAgainstSession({ id: 'queued-1', name: 'Queued 1', steps: [] });
    await firstStarted;
    const second = runMacroRecipeAgainstSession({ id: 'queued-2', name: 'Queued 2', steps: [] });

    await Promise.resolve();
    expect(mockExecuteMacroRecipe).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
    await second;

    expect(mockExecuteMacroRecipe).toHaveBeenCalledTimes(2);
    expect(mockExecuteMacroRecipe.mock.calls[1]?.[0]).toMatchObject({ id: 'queued-2' });
  });

});
