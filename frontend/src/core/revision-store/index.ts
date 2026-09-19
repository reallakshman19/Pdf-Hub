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
export {
  WorkingRevisionStoreRegistryError,
  registerWorkingRevisionStore,
  resolveWorkingRevisionStore,
  releaseWorkingRevisionStore,
} from './registry';
export {
  ensureStoredRevision,
  type EnsureStoredRevisionInput,
} from './ensureRevision';
