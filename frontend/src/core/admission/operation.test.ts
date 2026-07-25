import { describe, expect, it, vi } from 'vitest';
import { OperationCancelledError } from '@/core/cancellation/operationCancellation';
import { AdmissionOperationGate } from './operation';

function gate(signal?: AbortSignal) {
  return new AdmissionOperationGate({
    operationId: 'import-1',
    generation: 4,
    signal,
  });
}

describe('AdmissionOperationGate', () => {
  it('blocks commit before validation', () => {
    expect(() => gate().commit(4, () => 'committed'))
      .toThrow('must be validated before commit');
  });

  it('blocks a stale generation before mutation', () => {
    const operation = gate();
    const mutation = vi.fn(() => 'committed');
    operation.markValidated();

    expect(() => operation.commit(5, mutation))
      .toThrowError(OperationCancelledError);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('blocks an aborted operation before mutation', () => {
    const controller = new AbortController();
    const operation = gate(controller.signal);
    const mutation = vi.fn(() => 'committed');
    operation.markValidated();
    controller.abort('user cancelled import');

    expect(() => operation.commit(4, mutation))
      .toThrowError(OperationCancelledError);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('runs staged cleanups once in reverse registration order', async () => {
    const operation = gate();
    const order: string[] = [];
    operation.registerCleanup(() => {
      order.push('first');
    });
    operation.registerCleanup(async () => {
      await Promise.resolve();
      order.push('second');
    });

    await Promise.all([
      operation.cancel('cancelled'),
      operation.cancel('cancelled again'),
    ]);

    expect(order).toEqual(['second', 'first']);
    expect(operation.getState()).toBe('TERMINAL');
  });

  it('commits exactly once after validation', () => {
    const operation = gate();
    operation.markValidated();

    expect(operation.commit(4, () => 'committed')).toBe('committed');
    expect(operation.getState()).toBe('COMMITTED');
    expect(() => operation.commit(4, () => 'again')).toThrow();
  });
});
