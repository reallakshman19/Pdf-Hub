import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { useLoggerStore } from '@/core/logger/store';
import {
  dispatchDurableWriterUiCommand,
} from './durableWriterUiDispatch';
import {
  useWriterV2Store,
} from './writerV2Store';

describe('dispatchDurableWriterUiCommand', () => {
  beforeEach(() => {
    useLoggerStore.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    vi.restoreAllMocks();
  });

  it('returns the committed durable Writer result', async () => {
    const result = {
      state: {
        elements: [],
        selectedIds: [],
        activeId: null,
        undoStack: [],
        redoStack: [],
        dirty: false,
      },
      changed: true,
      reason: 'committed',
    };

    const dispatchSpy = vi
      .spyOn(
        useWriterV2Store.getState(),
        'dispatchWriterCommandDurable',
      )
      .mockResolvedValueOnce(result);

    await expect(
      dispatchDurableWriterUiCommand(
        {
          type: 'CLEAR_WRITER_SELECTION',
        },
        'test success',
      ),
    ).resolves.toEqual(result);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(
      useLoggerStore.getState().entries,
    ).toEqual([]);
  });

  it('logs context and command type before rethrowing a durable failure', async () => {
    vi.spyOn(
      useWriterV2Store.getState(),
      'dispatchWriterCommandDurable',
    ).mockRejectedValueOnce(
      new Error('journal write failed'),
    );

    await expect(
      dispatchDurableWriterUiCommand(
        {
          type: 'DELETE_WRITER_ELEMENT',
          id: 'writer-1',
        },
        'WriterElementBox delete',
      ),
    ).rejects.toThrow('journal write failed');

    expect(
      useLoggerStore.getState().entries[0],
    ).toMatchObject({
      level: 'error',
      source: 'writer',
      message:
        'Durable Writer UI mutation failed',
      data: {
        context: 'WriterElementBox delete',
        commandType:
          'DELETE_WRITER_ELEMENT',
        error: 'journal write failed',
      },
    });
  });
});
