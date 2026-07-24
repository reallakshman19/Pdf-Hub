import { describe, expect, it, vi } from 'vitest';
import {
  OperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from './operationCancellation';

describe('operation cancellation', () => {
  it('fails immediately when a signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort('user');
    expect(() => throwIfAborted(controller.signal, 'test operation'))
      .toThrow(OperationCancelledError);
  });

  it('rejects an active operation and invokes cleanup once', async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    let resolveOperation!: (value: number) => void;
    const operation = new Promise<number>((resolve) => {
      resolveOperation = resolve;
    });

    const pending = raceWithAbort(operation, controller.signal, 'long operation', cleanup);
    controller.abort('cancelled by test');

    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    expect(cleanup).toHaveBeenCalledTimes(1);

    resolveOperation(42);
    await Promise.resolve();
  });
});
