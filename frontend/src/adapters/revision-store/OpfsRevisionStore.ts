import {
  DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES,
} from '@/core/document-source/materialize';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { OpfsSource } from '@/adapters/document-source/OpfsSource';
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
import {
  commitOpfsRevisionBytes,
  isOpfsNotFoundError,
} from './opfsRevisionIo';

const OPFS_REVISION_CAPABILITIES: Readonly<RevisionStoreCapabilities> =
  Object.freeze({
    persistent: true,
    atomicCommit: true,
    randomAccess: true,
  });

export interface OpfsRevisionStoreInput {
  id: string;
  directory: FileSystemDirectoryHandle;
  chunkBytes?: number;
}

export interface CreateOpfsRevisionStoreInput {
  id: string;
  directoryName?: string;
  chunkBytes?: number;
}

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

/**
 * Persistent immutable working-revision store backed by OPFS.
 *
 * A revision file is published to callers only after its writable stream
 * closes and its final byte count is verified. Revision ids are immutable.
 */
export class OpfsRevisionStore implements WorkingRevisionStore {
  readonly id: string;
  readonly kind = 'opfs' as const;
  readonly capabilities = OPFS_REVISION_CAPABILITIES;
  private readonly directory: FileSystemDirectoryHandle;
  private readonly chunkBytes: number;
  private readonly pending = new Set<string>();

  constructor(input: OpfsRevisionStoreInput) {
    assertRevisionStoreId(input.id);
    const chunkBytes =
      input.chunkBytes ?? DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES;
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) {
      throw new RangeError(
        `OPFS revision chunkBytes must be a positive safe integer; received ${chunkBytes}.`,
      );
    }
    this.id = input.id;
    this.directory = input.directory;
    this.chunkBytes = chunkBytes;
  }
  static async create(
    input: CreateOpfsRevisionStoreInput,
  ): Promise<OpfsRevisionStore> {
    assertRevisionStoreId(input.id);
    const storage =
      globalThis.navigator?.storage as StorageManagerWithDirectory | undefined;
    if (!storage?.getDirectory) {
      throw new RevisionStoreError(
        'UNSUPPORTED',
        input.id,
        'Origin Private File System is not available in this browser.',
      );
    }

    const root = await storage.getDirectory();
    const container = await root.getDirectoryHandle(
      input.directoryName ?? 'pdf-hub-revisions',
      { create: true },
    );
    const directory = await container.getDirectoryHandle(
      encodeURIComponent(input.id),
      { create: true },
    );
    return new OpfsRevisionStore({
      id: input.id,
      directory,
      chunkBytes: input.chunkBytes,
    });
  }
  async commit(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    assertRevisionId(this.id, input.revisionId);
    if (this.pending.has(input.revisionId)) {
      throw this.existsError(input.revisionId);
    }

    this.pending.add(input.revisionId);
    try {
      if (await this.hasCommittedRevision(input.revisionId)) {
        throw this.existsError(input.revisionId);
      }
      return await this.commitNewRevision(input);
    } finally {
      this.pending.delete(input.revisionId);
    }
  }
  async open(revisionId: string): Promise<OpfsSource> {
    assertRevisionId(this.id, revisionId);
    if (this.pending.has(revisionId)) {
      throw this.notFoundError(revisionId);
    }
    try {
      const handle = await this.directory.getFileHandle(
        this.fileName(revisionId),
      );
      const file = await handle.getFile();
      return new OpfsSource({
        id: revisionSourceId(this.id, revisionId),
        handle,
        expectedSize: file.size,
      });
    } catch (error) {
      if (isOpfsNotFoundError(error)) {
        throw this.notFoundError(revisionId);
      }
      if (error instanceof RevisionStoreError) {
        throw error;
      }
      throw new RevisionStoreError(
        'READ_FAILED',
        this.id,
        `Failed to open revision ${revisionId}.`,
        { revisionId, cause: error },
      );
    }
  }
  async has(revisionId: string): Promise<boolean> {
    assertRevisionId(this.id, revisionId);
    if (this.pending.has(revisionId)) {
      return false;
    }
    return this.hasCommittedRevision(revisionId);
  }
  async listRevisionIds(): Promise<string[]> {
    const ids: string[] = [];
    try {
      const directory =
        this.directory as DirectoryWithEntries;
      for await (
        const [name] of directory.entries()
      ) {
        const revisionId =
          this.revisionIdFromFileName(name);
        if (
          revisionId
          && !this.pending.has(revisionId)
        ) {
          ids.push(revisionId);
        }
      }
    } catch (error) {
      throw new RevisionStoreError(
        'READ_FAILED',
        this.id,
        'Failed to enumerate OPFS revisions.',
        { cause: error },
      );
    }
    return ids.sort();
  }

  async remove(revisionId: string): Promise<void> {
    assertRevisionId(this.id, revisionId);
    this.assertNotPending(revisionId);
    try {
      await this.directory.removeEntry(
        this.fileName(revisionId),
      );
    } catch (error) {
      if (isOpfsNotFoundError(error)) return;
      throw new RevisionStoreError(
        'REMOVE_FAILED',
        this.id,
        `Failed to remove revision ${revisionId}.`,
        { revisionId, cause: error },
      );
    }
  }

  async clear(): Promise<void> {
    if (this.pending.size > 0) {
      throw new RevisionStoreError(
        'REVISION_BUSY',
        this.id,
        'Cannot clear OPFS revision store while a revision commit is pending.',
      );
    }
    try {
      const directory = this.directory as DirectoryWithEntries;
      for await (const [name] of directory.entries()) {
        if (name.startsWith('revision-') && name.endsWith('.pdf')) {
          await this.directory.removeEntry(name);
        }
      }
    } catch (error) {
      throw new RevisionStoreError(
        'REMOVE_FAILED',
        this.id,
        'Failed to clear OPFS revision store.',
        { cause: error },
      );
    }
  }

  private async hasCommittedRevision(
    revisionId: string,
  ): Promise<boolean> {
    try {
      await this.directory.getFileHandle(
        this.fileName(revisionId),
      );
      return true;
    } catch (error) {
      if (isOpfsNotFoundError(error)) return false;
      throw new RevisionStoreError(
        'READ_FAILED',
        this.id,
        `Failed to inspect revision ${revisionId}.`,
        { revisionId, cause: error },
      );
    }
  }

  private assertNotPending(revisionId: string): void {
    if (!this.pending.has(revisionId)) return;
    throw new RevisionStoreError(
      'REVISION_BUSY',
      this.id,
      `Revision ${revisionId} is still being committed.`,
      { revisionId },
    );
  }

  private async commitNewRevision(
    input: CommitRevisionInput,
  ): Promise<StoredRevision> {
    try {
      const size = await commitOpfsRevisionBytes({
        directory: this.directory,
        fileName: this.fileName(input.revisionId),
        source: input.source,
        signal: input.signal,
        chunkBytes: this.chunkBytes,
      });
      return this.descriptor(input.revisionId, size);
    } catch (error) {
      if (
        error instanceof RevisionStoreError
        || isOperationCancelledError(error)
      ) {
        throw error;
      }
      throw new RevisionStoreError(
        'COMMIT_FAILED',
        this.id,
        `Failed to commit revision ${input.revisionId}.`,
        { revisionId: input.revisionId, cause: error },
      );
    }
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
      persistent: true,
    });
  }

  private fileName(revisionId: string): string {
    return `revision-${encodeURIComponent(revisionId)}.pdf`;
  }

  private revisionIdFromFileName(
    name: string,
  ): string | null {
    const prefix = 'revision-';
    const suffix = '.pdf';
    if (
      !name.startsWith(prefix)
      || !name.endsWith(suffix)
    ) {
      return null;
    }

    const encoded = name.slice(
      prefix.length,
      -suffix.length,
    );
    try {
      const revisionId =
        decodeURIComponent(encoded);
      if (!revisionId.trim()) return null;
      return this.fileName(revisionId)
        === name
        ? revisionId
        : null;
    } catch {
      return null;
    }
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
