import {
  isOperationCancelledError,
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';
import { RevisionStoreError } from './errors';
import type {
  StoredRevision,
  WorkingRevisionStore,
} from './types';
import type { DocumentSource } from '@/core/document-source/types';
import { revisionSourceId } from './validation';

export interface EnsureStoredRevisionInput {
  readonly store: WorkingRevisionStore;
  readonly revisionId: string;
  readonly source: DocumentSource;
  readonly signal?: AbortSignal;
}

const pendingEnsures = new Map<
  string,
  Promise<StoredRevision>
>();

/**
 * Ensure a content-addressed immutable revision exists.
 *
 * Reuse is allowed only when the stored and incoming source sizes agree.
 * Concurrent creators may race; a REVISION_EXISTS result is resolved by
 * reopening the committed revision instead of failing admission.
 */
export async function ensureStoredRevision(
  input: EnsureStoredRevisionInput,
): Promise<StoredRevision> {
  const key = `${input.store.id}\u0000${input.revisionId}`;
  const pending = pendingEnsures.get(key);
  if (pending) {
    try {
      return await raceWithAbort(
        pending,
        input.signal,
        'wait for working revision publication',
      );
    } catch (error) {
      if (
        isOperationCancelledError(error)
        && !input.signal?.aborted
      ) {
        return ensureStoredRevision(input);
      }
      throw error;
    }
  }

  const rawPublication =
    ensureStoredRevisionUncoordinated(input);
  let publication!: Promise<StoredRevision>;
  publication = rawPublication.finally(() => {
    if (pendingEnsures.get(key) === publication) {
      pendingEnsures.delete(key);
    }
  });
  pendingEnsures.set(key, publication);
  return publication;
}

async function ensureStoredRevisionUncoordinated(
  input: EnsureStoredRevisionInput,
): Promise<StoredRevision> {
  if (await input.store.has(input.revisionId)) {
    return descriptorForExisting(input);
  }

  try {
    return await input.store.commit({
      revisionId: input.revisionId,
      source: input.source,
      signal: input.signal,
    });
  } catch (error) {
    if (isOperationCancelledError(error)) throw error;
    if (
      error instanceof RevisionStoreError
      && error.code === 'REVISION_EXISTS'
    ) {
      return descriptorForExisting(input);
    }
    throw error;
  }
}

async function descriptorForExisting(
  input: EnsureStoredRevisionInput,
): Promise<StoredRevision> {
  const [storedSource, incomingSize] = await Promise.all([
    input.store.open(input.revisionId),
    raceWithAbort(
      input.source.size(),
      input.signal,
      'ensure working revision: source size',
    ),
  ]);
  const storedSize = await raceWithAbort(
    storedSource.size(),
    input.signal,
    'ensure working revision: stored size',
  );

  if (storedSize !== incomingSize) {
    throw new RevisionStoreError(
      'READ_FAILED',
      input.store.id,
      `Stored revision ${input.revisionId} has ${storedSize} byte(s), expected ${incomingSize}.`,
      { revisionId: input.revisionId },
    );
  }

  return Object.freeze({
    revisionId: input.revisionId,
    sourceId: revisionSourceId(
      input.store.id,
      input.revisionId,
    ),
    storeId: input.store.id,
    storeKind: input.store.kind,
    size: storedSize,
    persistent: input.store.capabilities.persistent,
  });
}
