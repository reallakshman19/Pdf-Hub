import {
  materializeDocumentSource,
} from '@/core/document-source/materialize';
import { MemorySource } from '@/adapters/document-source/MemorySource';
import { RevisionStoreError } from '@/core/revision-store/errors';
import type {
  CommitRevisionInput,
  RevisionStoreCapabilities,
  StoredRevision,
  WorkingRevisionStore,
} from '@/core/revision-store/types';
import {
  assertRevisionId,
  assertRevisionStoreId,
  revisionSourceId,
} from '@/core/revision-store/validation';

const MEMORY_REVISION_CAPABILITIES: Readonly<RevisionStoreCapabilities> =
  Object.freeze({
    persistent: false,
    atomicCommit: true,
    randomAccess: true,
  });

export interface MemoryRevisionStoreInput {
  id: string;
}

/**
 * In-memory fallback for working revisions.
 *
 * Commit materializes into a private buffer before publishing it to the map,
 * so cancelled/failed writes never expose a partial revision.
 */
export class MemoryRevisionStore implements WorkingRevisionStore {
  readonly id: string;
  readonly kind = 'memory' as const;
  readonly capabilities = MEMORY_REVISION_CAPABILITIES;

  private readonly revisions = new Map<string, Uint8Array>();

  constructor(input: MemoryRevisionStoreInput) {
    assertRevisionStoreId(input.id);
    this.id = input.id;
  }

  async commit(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    assertRevisionId(this.id, input.revisionId);
    if (this.revisions.has(input.revisionId)) {
      throw this.existsError(input.revisionId);
    }

    const bytes = await materializeDocumentSource(
      input.source,
      { signal: input.signal },
    );

    if (this.revisions.has(input.revisionId)) {
      throw this.existsError(input.revisionId);
    }

    this.revisions.set(
      input.revisionId,
      Uint8Array.from(bytes),
    );
    return this.descriptor(
      input.revisionId,
      bytes.byteLength,
    );
  }

  async open(revisionId: string): Promise<MemorySource> {
    assertRevisionId(this.id, revisionId);
    const bytes = this.revisions.get(revisionId);
    if (!bytes) {
      throw this.notFoundError(revisionId);
    }

    return new MemorySource({
      id: revisionSourceId(this.id, revisionId),
      bytes,
    });
  }

  async has(revisionId: string): Promise<boolean> {
    assertRevisionId(this.id, revisionId);
    return this.revisions.has(revisionId);
  }

  async remove(revisionId: string): Promise<void> {
    assertRevisionId(this.id, revisionId);
    this.revisions.delete(revisionId);
  }

  async clear(): Promise<void> {
    this.revisions.clear();
  }

  private descriptor(
    revisionId: string,
    size: number,
  ): StoredRevision {
    return Object.freeze({
      revisionId,
      sourceId: revisionSourceId(this.id, revisionId),
      storeId: this.id,
      storeKind: this.kind,
      size,
      persistent: false,
    });
  }

  private existsError(revisionId: string): RevisionStoreError {
    return new RevisionStoreError(
      'REVISION_EXISTS',
      this.id,
      `Revision ${revisionId} already exists and cannot be overwritten.`,
      { revisionId },
    );
  }

  private notFoundError(revisionId: string): RevisionStoreError {
    return new RevisionStoreError(
      'REVISION_NOT_FOUND',
      this.id,
      `Revision ${revisionId} does not exist.`,
      { revisionId },
    );
  }
}
