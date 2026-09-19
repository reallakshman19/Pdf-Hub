export type RevisionStoreErrorCode =
  | 'INVALID_STORE_ID'
  | 'INVALID_REVISION_ID'
  | 'REVISION_EXISTS'
  | 'REVISION_NOT_FOUND'
  | 'COMMIT_FAILED'
  | 'READ_FAILED'
  | 'REMOVE_FAILED'
  | 'UNSUPPORTED';

export class RevisionStoreError extends Error {
  readonly code: RevisionStoreErrorCode;
  readonly storeId: string;
  readonly revisionId?: string;

  constructor(
    code: RevisionStoreErrorCode,
    storeId: string,
    message: string,
    options?: ErrorOptions & { revisionId?: string },
  ) {
    super(message, options);
    this.name = 'RevisionStoreError';
    this.code = code;
    this.storeId = storeId;
    this.revisionId = options?.revisionId;
  }
}
