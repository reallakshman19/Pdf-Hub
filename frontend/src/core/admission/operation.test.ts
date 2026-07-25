import { describe, expect, it } from 'vitest';
import { OperationCancelledError } from '@/core/cancellation/operationCancellation';
import { assertAdmissionCommitAllowed } from './operation';

describe('admission commit checkpoint', () => {
  it('allows delegation when no signal is supplied', () => {
    expect(() => assertAdmissionCommitAllowed(
      undefined,
      'open admitted PDF',
    )).not.toThrow();
  });

  it('allows delegation while the operation remains active', () => {
    const controller = new AbortController();

    expect(() => assertAdmissionCommitAllowed(
      controller.signal,
      'open admitted PDF',
    )).not.toThrow();
  });

  it('blocks delegation through the shared cancellation contract', () => {
    const controller = new AbortController();
    controller.abort('superseded');

    expect(() => assertAdmissionCommitAllowed(
      controller.signal,
      'open admitted PDF',
    )).toThrowError(OperationCancelledError);
  });
});
