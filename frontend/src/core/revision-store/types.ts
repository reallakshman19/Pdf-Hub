import type { DocumentSource } from '@/core/document-source/types';

export type RevisionStoreKind = 'memory' | 'opfs';

export interface RevisionStoreCapabilities {
  /** Committed revisions survive a page reload/browser process restart. */
  readonly persistent: boolean;
  /** A revision becomes visible only after its complete byte sequence commits. */
  readonly atomicCommit: boolean;
  /** Committed revisions can be reopened as random-access DocumentSource values. */
  readonly randomAccess: boolean;
}

export interface StoredRevision {
  readonly revisionId: string;
  readonly sourceId: string;
  readonly storeId: string;
  readonly storeKind: RevisionStoreKind;
  readonly size: number;
  readonly persistent: boolean;
}

export interface CommitRevisionInput {
  readonly revisionId: string;
  readonly source: DocumentSource;
  readonly signal?: AbortSignal;
}

/**
 * Storage boundary for immutable working PDF revisions.
 *
 * A committed revision id always names the same bytes. Updating a document
 * therefore creates a new revision id and only switches the active pointer
 * after commit succeeds. Stores must reject attempts to overwrite an existing
 * revision id.
 */
export interface WorkingRevisionStore {
  readonly id: string;
  readonly kind: RevisionStoreKind;
  readonly capabilities: Readonly<RevisionStoreCapabilities>;

  commit(input: CommitRevisionInput): Promise<StoredRevision>;
  open(revisionId: string): Promise<DocumentSource>;
  has(revisionId: string): Promise<boolean>;
  remove(revisionId: string): Promise<void>;
  clear(): Promise<void>;
}
