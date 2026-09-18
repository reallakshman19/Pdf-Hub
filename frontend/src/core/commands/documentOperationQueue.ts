let operationTail: Promise<unknown> = Promise.resolve();

export function enqueueDocumentOperation<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  const run = operationTail.then(operation);
  operationTail = run.catch(() => undefined);
  return run;
}

export function resetDocumentOperationQueueForTests(): void {
  operationTail = Promise.resolve();
}
