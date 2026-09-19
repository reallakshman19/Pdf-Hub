import type { DocumentSource } from '@/core/document-source/types';
import { assertDocumentSourceSize } from '@/core/document-source/validation';
import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';

export interface CommitOpfsRevisionBytesInput {
  readonly directory: FileSystemDirectoryHandle;
  readonly fileName: string;
  readonly source: DocumentSource;
  readonly signal?: AbortSignal;
  readonly chunkBytes: number;
}

/**
 * Writes one immutable revision file and verifies its final byte count.
 *
 * The caller owns revision identity/publication. This helper owns only the
 * low-level OPFS write, cancellation checkpoints and failure cleanup.
 */
export async function commitOpfsRevisionBytes(
  input: CommitOpfsRevisionBytesInput,
): Promise<number> {
  let writable: FileSystemWritableFileStream | null = null;

  try {
    const size = await raceWithAbort(
      input.source.size(),
      input.signal,
      'commit working revision: source size',
    );
    assertDocumentSourceSize(input.source.id, size);

    const handle = await input.directory.getFileHandle(
      input.fileName,
      { create: true },
    );
    writable = await handle.createWritable({
      keepExistingData: false,
    });

    await copyDocumentSourceToWritable({
      source: input.source,
      writable,
      size,
      chunkBytes: input.chunkBytes,
      signal: input.signal,
    });
    await writable.close();
    writable = null;

    const committedFile = await handle.getFile();
    if (committedFile.size !== size) {
      throw new Error(
        `Committed revision has ${committedFile.size} byte(s); expected ${size}.`,
      );
    }
    return size;
  } catch (error) {
    await bestEffortAbort(writable);
    await bestEffortRemove(
      input.directory,
      input.fileName,
    );
    throw error;
  }
}

interface CopyDocumentSourceInput {
  readonly source: DocumentSource;
  readonly writable: FileSystemWritableFileStream;
  readonly size: number;
  readonly chunkBytes: number;
  readonly signal?: AbortSignal;
}

async function copyDocumentSourceToWritable(
  input: CopyDocumentSourceInput,
): Promise<void> {
  for (
    let offset = 0;
    offset < input.size;
    offset += input.chunkBytes
  ) {
    throwIfAborted(
      input.signal,
      'commit working revision: before range read',
    );
    const length = Math.min(
      input.chunkBytes,
      input.size - offset,
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
      input.writable.write(bytes),
      input.signal,
      'commit working revision: write chunk',
    );
  }
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

export function isOpfsNotFoundError(error: unknown): boolean {
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
