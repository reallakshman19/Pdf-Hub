import { getDocumentSessionGeneration, useSessionStore } from './store';

/** Runtime-only authority of an operation, captured before it enters a queue. */
export type DocumentMutationOwner = {
  readonly generation: number;
  readonly session: ReturnType<typeof useSessionStore.getState>;
};

export class StaleDocumentMutationError extends Error {
  constructor() {
    super('The active document session or revision changed before this operation could commit.');
    this.name = 'StaleDocumentMutationError';
  }
}

export function captureDocumentMutationOwner(): DocumentMutationOwner {
  return { generation: getDocumentSessionGeneration(), session: useSessionStore.getState() };
}

/** The operation may itself advance the revision; these fields must never change. */
export function isDocumentSessionOwnerCurrent(owner: DocumentMutationOwner): boolean {
  const current = useSessionStore.getState();
  const prior = owner.session;
  return owner.generation === getDocumentSessionGeneration()
    && prior.sourceId === current.sourceId
    && prior.revisionStoreId === current.revisionStoreId
    && prior.historyJournalStoreId === current.historyJournalStoreId
    && prior.historyJournalId === current.historyJournalId;
}

/** Captured positional intent may not be silently applied to a different revision. */
export function isDocumentMutationOwnerCurrent(owner: DocumentMutationOwner): boolean {
  const current = useSessionStore.getState();
  const prior = owner.session;
  return isDocumentSessionOwnerCurrent(owner)
    && prior.documentKey === current.documentKey
    && prior.activeRevisionId === current.activeRevisionId
    && prior.pageGraph === current.pageGraph
    && prior.workingBytes === current.workingBytes;
}

export function assertDocumentMutationOwner(owner: DocumentMutationOwner): void {
  if (!isDocumentMutationOwnerCurrent(owner)) throw new StaleDocumentMutationError();
}
