import {
  RevisionStoreError,
} from '@/core/revision-store/errors';

type DirectoryWithEntries =
  FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<
      [string, FileSystemHandle]
    >;
  };

export async function clearCommittedOpfsRevisionFiles(
  input: {
    storeId: string;
    directory:
      FileSystemDirectoryHandle;
  },
): Promise<void> {
  try {
    const directory =
      input.directory as DirectoryWithEntries;
    for await (
      const [name] of
        directory.entries()
    ) {
      if (
        name.startsWith('revision-')
        && name.endsWith('.pdf')
      ) {
        await input.directory
          .removeEntry(name);
      }
    }
  } catch (error) {
    throw new RevisionStoreError(
      'REMOVE_FAILED',
      input.storeId,
      'Failed to clear OPFS revision store.',
      { cause: error },
    );
  }
}

export async function listCommittedOpfsRevisionIds(
  input: {
    storeId: string;
    directory:
      FileSystemDirectoryHandle;
    pending:
      ReadonlySet<string>;
  },
): Promise<string[]> {
  const ids: string[] = [];
  try {
    const directory =
      input.directory as DirectoryWithEntries;
    for await (
      const [name] of
        directory.entries()
    ) {
      const revisionId =
        revisionIdFromFileName(name);
      if (
        revisionId
        && !input.pending.has(
          revisionId,
        )
      ) {
        ids.push(revisionId);
      }
    }
  } catch (error) {
    throw new RevisionStoreError(
      'READ_FAILED',
      input.storeId,
      'Failed to enumerate OPFS revisions.',
      { cause: error },
    );
  }
  return ids.sort();
}

function revisionIdFromFileName(
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
    return revisionFileName(
      revisionId,
    ) === name
      ? revisionId
      : null;
  } catch {
    return null;
  }
}

function revisionFileName(
  revisionId: string,
): string {
  return `revision-${encodeURIComponent(revisionId)}.pdf`;
}
