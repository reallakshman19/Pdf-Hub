import {
  DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES,
} from '@/core/document-source/materialize';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { assertDocumentSourceSize } from '@/core/document-source/validation';
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
      if (isNotFound(error)) {
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

  async remove(revisionId: string): Promise<void> {
    assertRevisionId(this.id, revisionId);
    this.assertNotPending(revisionId);
    try {
      await this.directory.removeEntry(
        this.fileName(revisionId),
      );
    } catch (error) {
      if (isNotFound(error)) return;
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
      for await (const [name] of this.directory.entries()) {
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
      if (isNotFound(error)) return false;
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
    const size = await raceWithAbort(
      input.source.size(),
      input.signal,
      'commit working revision: source size',
    );
    assertDocumentSourceSize(input.source.id, size);

    const fileName = this.fileName(input.revisionId);
    const handle = await this.directory.getFileHandle(
      fileName,
      { create: true },
    );
    let writable: FileSystemWritableFileStream | null = null;

    try {
      writable = await handle.createWritable({
        keepExistingData: false,
      });
      await this.copyIntoWritable(
        input,
        writable,
        size,
      );
      await writable.close();
      writable = null;

      const committedFile = await handle.getFile();
      if (committedFile.size !== size) {
        throw new Error(
          `Committed revision has ${committedFile.size} byte(s); expected ${size}.`,
        );
      }
      return this.descriptor(input.revisionId, size);
    } catch (error) {
      await bestEffortAbort(writable);
      await bestEffortRemove(this.directory, fileName);
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

  private async copyIntoWritable(
    input: CommitRevisionInput,
    writable: FileSystemWritableFileStream,
    size: number,
  ): Promise<void> {
    for (
      let offset = 0;
      offset < size;
      offset += this.chunkBytes
    ) {
      throwIfAborted(
        input.signal,
        'commit working revision: before range read',
      );
      const length = Math.min(
        this.chunkBytes,
        size - offset,
      );
      const bytes = await raceWithAbort(
        input.source.read(offset, length),
        input.signal,
        'commit working revision: range read',
      );
      if (bytes.byteLength !== length) {
        throw new Error(
          `Source returned ${bytes.byteLength} byte(s) for requested ${length}-byte revision chunk.`,
        );
      }
      await raceWithAbort(
        writable.write(bytes),
        input.signal,
        'commit working revision: write chunk',
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

function isNotFound(error: unknown): boolean {
  return (
    error instanceof DOMException
    && error.name === 'NotFoundError'
  ) || (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'NotFoundError'
  );
}

async function bestEffortAbort(
  writable: FileSystemWritableFileStream | null,
): Promise<void> {
  if (!writable) return;
  try {
    await writable.abort();
  } catch {
    // Cleanup must not mask the original commit failure.
  }
}

async function bestEffortRemove(
  directory: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  try {
    await directory.removeEntry(fileName);
  } catch {
    // Cleanup must not mask the original commit failure.
  }
}
