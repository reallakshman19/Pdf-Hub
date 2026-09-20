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

export {
  acquireRevisionStoreExclusiveLease,
  acquireRevisionStoreGcBlockerLease,
  acquireRevisionStoreGcClearanceLease,
  RevisionStoreGcBlockedError,
  RevisionStoreLockUnavailableError,
  revisionStoreExclusiveLockName,
  revisionStoreGcBlockerLockName,
  type RevisionStoreExclusiveLease,
} from './exclusion';
export {
  acquireRevisionPin,
  listRevisionPins,
  type RevisionPinHandle,
  type RevisionRuntimePin,
} from './pins';
