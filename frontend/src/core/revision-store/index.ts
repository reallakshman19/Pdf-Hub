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
} from './pins';
export {
  planRevisionReachability,
  type RevisionGcSessionReference,
  type RevisionReachabilityDiagnostic,
  type RevisionReachabilityEntry,
  type RevisionReachabilityPlan,
  type RevisionReachabilityReason,
  type RevisionRuntimePin,
} from './reachability';
export {
  executeRevisionGarbageCollection,
  planLiveRevisionGarbageCollection,
  RevisionGarbageCollectionError,
  type RevisionGarbageCollectionPlan,
  type RevisionGarbageCollectionResult,
} from './gc';
