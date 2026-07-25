import {
  OperationCancelledError,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type { AdmissionOperationIdentity } from './types';

type AdmissionOperationState =
  | 'OPEN'
  | 'VALIDATED'
  | 'COMMITTED'
  | 'TERMINAL';

type AdmissionCleanup = () => void | Promise<void>;

export class AdmissionOperationGate {
  readonly identity: AdmissionOperationIdentity;
  readonly signal?: AbortSignal;

  private state: AdmissionOperationState = 'OPEN';
  private readonly cleanups: AdmissionCleanup[] = [];
  private cleanupPromise: Promise<void> | null = null;

  constructor(input: AdmissionOperationIdentity & { readonly signal?: AbortSignal }) {
    if (!input.operationId.trim()) {
      throw new Error('Admission operationId must not be empty.');
    }
    if (!Number.isSafeInteger(input.generation) || input.generation < 0) {
      throw new Error('Admission generation must be a non-negative safe integer.');
    }

    this.identity = {
      operationId: input.operationId,
      generation: input.generation,
    };
    this.signal = input.signal;
  }

  registerCleanup(cleanup: AdmissionCleanup): () => void {
    this.assertUsable('register admission cleanup');
    this.cleanups.push(cleanup);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const index = this.cleanups.indexOf(cleanup);
      if (index >= 0) this.cleanups.splice(index, 1);
    };
  }

  markValidated(): void {
    this.assertUsable('validate admission operation');
    if (this.state === 'COMMITTED') {
      throw new Error('Admission operation is already committed.');
    }
    this.state = 'VALIDATED';
  }

  commit<T>(currentGeneration: number, mutation: () => T): T {
    this.assertUsable('commit admission operation');
    if (this.state !== 'VALIDATED') {
      throw new Error('Admission operation must be validated before commit.');
    }
    if (currentGeneration !== this.identity.generation) {
      throw new OperationCancelledError(
        'commit stale admission operation',
        {
          expectedGeneration: currentGeneration,
          operationGeneration: this.identity.generation,
        },
      );
    }

    throwIfAborted(this.signal, 'commit admission operation');
    const result = mutation();
    this.cleanups.length = 0;
    this.state = 'COMMITTED';
    return result;
  }

  cancel(reason?: unknown): Promise<void> {
    if (this.state === 'COMMITTED') {
      return Promise.resolve();
    }
    this.state = 'TERMINAL';
    return this.dispose(reason);
  }

  fail(reason?: unknown): Promise<void> {
    if (this.state === 'COMMITTED') return Promise.resolve();
    this.state = 'TERMINAL';
    return this.dispose(reason);
  }

  assertUsable(operation: string): void {
    throwIfAborted(this.signal, operation);
    if (this.state === 'TERMINAL') {
      throw new OperationCancelledError(operation, 'Admission operation is terminal.');
    }
    if (this.state === 'COMMITTED') {
      throw new Error('Admission operation is already committed.');
    }
  }

  getState(): AdmissionOperationState {
    return this.state;
  }

  private dispose(_reason?: unknown): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    const callbacks = this.cleanups.splice(0).reverse();
    this.cleanupPromise = callbacks.reduce<Promise<void>>(
      async (previous, cleanup) => {
        await previous;
        try {
          await cleanup();
        } catch {
          // Cleanup failures must not prevent later resources from being released.
        }
      },
      Promise.resolve(),
    );
    return this.cleanupPromise;
  }
}
