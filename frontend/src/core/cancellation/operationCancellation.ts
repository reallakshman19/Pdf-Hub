export class OperationCancelledError extends Error {
  readonly code = 'OPERATION_CANCELLED';
  readonly operation: string;
  readonly reason: unknown;

  constructor(operation: string, reason?: unknown) {
    super(`Operation cancelled while running ${operation}.`);
    this.name = 'OperationCancelledError';
    this.operation = operation;
    this.reason = reason;
  }
}

export function isOperationCancelledError(error: unknown): error is OperationCancelledError {
  return error instanceof OperationCancelledError || (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'OPERATION_CANCELLED'
  );
}

export function throwIfAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted) {
    throw new OperationCancelledError(operation, signal.reason);
  }
}

export async function raceWithAbort<T>(
  operationPromise: Promise<T>,
  signal: AbortSignal | undefined,
  operation: string,
  onAbort?: () => void,
): Promise<T> {
  throwIfAborted(signal, operation);
  if (!signal) return operationPromise;

  let removeAbortListener = () => undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    const handleAbort = () => {
      try {
        onAbort?.();
      } finally {
        reject(new OperationCancelledError(operation, signal.reason));
      }
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', handleAbort);
  });

  void operationPromise.catch(() => undefined);
  try {
    return await Promise.race([operationPromise, abortPromise]);
  } finally {
    removeAbortListener();
  }
}
