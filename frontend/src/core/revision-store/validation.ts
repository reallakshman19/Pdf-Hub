import { RevisionStoreError } from './errors';

export function assertRevisionStoreId(storeId: string): void {
  if (storeId.trim().length === 0) {
    throw new RevisionStoreError(
      'INVALID_STORE_ID',
      storeId,
      'WorkingRevisionStore id must not be empty.',
    );
  }
}

export function assertRevisionId(
  storeId: string,
  revisionId: string,
): void {
  if (revisionId.trim().length === 0) {
    throw new RevisionStoreError(
      'INVALID_REVISION_ID',
      storeId,
      'Revision id must not be empty.',
      { revisionId },
    );
  }
}

export function revisionSourceId(
  storeId: string,
  revisionId: string,
): string {
  assertRevisionStoreId(storeId);
  assertRevisionId(storeId, revisionId);
  return `revision:${encodeURIComponent(storeId)}:${encodeURIComponent(revisionId)}`;
}
