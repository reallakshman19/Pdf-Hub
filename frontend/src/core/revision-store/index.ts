export type {
  CommitRevisionInput,
  RevisionStoreCapabilities,
  RevisionStoreKind,
  StoredRevision,
  WorkingRevisionStore,
} from './types';
export {
  RevisionStoreError,
  type RevisionStoreErrorCode,
} from './errors';
export {
  assertRevisionId,
  assertRevisionStoreId,
  revisionSourceId,
} from './validation';
