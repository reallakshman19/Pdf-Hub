export {
  planRevisionReachability,
  type RevisionGcSessionReference,
  type RevisionReachabilityDiagnostic,
  type RevisionReachabilityEntry,
  type RevisionReachabilityPlan,
  type RevisionReachabilityReason,
} from './reachability';
export {
  executeRevisionGarbageCollection,
  planLiveRevisionGarbageCollection,
  RevisionGarbageCollectionError,
  type RevisionGarbageCollectionPlan,
  type RevisionGarbageCollectionResult,
} from './gc';
