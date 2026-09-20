import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { useLoggerStore } from '@/core/logger/store';
import {
  dispatchDurableWriterHelperLatest,
} from './durableWriterHelperDispatch';
import {
  useWriterV2Store,
} from './writerV2Store';

describe('dispatchDurableWriterHelperLatest', () => {
  beforeEach(() => {
    useLoggerStore.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    vi.restoreAllMocks();
  });

  it('returns committed changed/reason from the latest-state durable factory', async () => {
    const dispatchSpy = vi
      .spyOn(
        useWriterV2Store.getState(),
        'dispatchWriterCommandDurableLatest',
      )
      .mockResolvedValueOnce({
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
      });

    await expect(
      dispatchDurableWriterHelperLatest(
        'review update',
        () => ({
          type: 'CLEAR_WRITER_SELECTION',
        }),
      ),
    ).resolves.toEqual({
      changed: true,
      reason: 'committed',
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(
      useLoggerStore.getState().entries,
    ).toEqual([]);
  });

  it('logs and converts durable failures into unchanged helper results', async () => {
    vi.spyOn(
      useWriterV2Store.getState(),
      'dispatchWriterCommandDurableLatest',
    ).mockRejectedValueOnce(
      new Error('journal write failed'),
    );

    await expect(
      dispatchDurableWriterHelperLatest(
        'table-box update',
        () => null,
      ),
    ).resolves.toEqual({
      changed: false,
      reason: 'journal write failed',
    });

    expect(
      useLoggerStore.getState().entries[0],
    ).toMatchObject({
      level: 'error',
      source: 'writer',
      message:
        'Durable Writer helper mutation failed',
      data: {
        context: 'table-box update',
        error: 'journal write failed',
      },
    });
  });
});
