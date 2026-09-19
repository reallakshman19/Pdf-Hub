import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function fail(message) {
  failed = true;
  console.error(
    `[phase8-mutation-revision] ${message}`,
  );
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

const borrowedPath =
  'src/adapters/document-source/BorrowedBytesSource.ts';
const borrowed = read(borrowedPath);
requireContains(borrowed, borrowedPath, [
  'implements DocumentSource',
  'this.bytes = input.bytes',
  'this.bytes.slice(offset, offset + length)',
  'persistent: false',
]);
forbidContains(borrowed, borrowedPath, [
  'Uint8Array.from(input.bytes)',
  'new Uint8Array(input.bytes)',
  'pdf-lib',
  'zustand',
  '@/core/session/',
]);

const sessionPath = 'src/core/session/store.ts';
const session = read(sessionPath);
requireContains(session, sessionPath, [
  'activeRevisionId?: string | null',
  'activeRevisionId = null',
  'resolveWorkingRevisionStore(revisionStoreId)',
  'workingBytes: bytes',
  'activeRevisionId,',
]);

const historyTypesPath =
  'src/core/document-history/types.ts';
const historyTypes = read(historyTypesPath);
requireContains(historyTypes, historyTypesPath, [
  'activeRevisionId?: string | null',
]);

const historyStatePath =
  'src/core/document-history/stateTransaction.ts';
const historyState = read(historyStatePath);
requireContains(historyState, historyStatePath, [
  'activeRevisionId: session.activeRevisionId',
]);

const historyRestorePath =
  'src/core/document-history/transactions.ts';
const historyRestore = read(historyRestorePath);
requireContains(historyRestore, historyRestorePath, [
  'state.activeRevisionId ?? null',
]);

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  'BorrowedBytesSource',
  'ensureStoredRevision',
  'resolveWorkingRevisionStore',
  'publishMutationRevision',
  'revisionId: documentKey',
  'signal?: AbortSignal',
  'input.signal',
  'activeRevisionId: sessionSnapshot.activeRevisionId',
  'activeRevisionId: sessionAfter.activeRevisionId',
  'activeRevisionId: publishedRevisionId',
]);

const publishIndex = transaction.indexOf(
  'publishedRevisionId = await publishMutationRevision',
);
const annotationPersistIndex = transaction.indexOf(
  'await saveAnnotations(nextDocumentKey, annotationsToPersist)',
);
const sessionCommitIndex = transaction.indexOf(
  'useSessionStore.getState().replaceWorkingCopy',
);
if (
  publishIndex < 0
  || annotationPersistIndex < 0
  || sessionCommitIndex < 0
  || !(publishIndex < annotationPersistIndex)
  || !(annotationPersistIndex < sessionCommitIndex)
) {
  fail(
    'DocumentTransaction must publish revision before annotation persistence and state commit.',
  );
}

const dispatchPath = 'src/core/commands/dispatch.ts';
const dispatch = read(dispatchPath);
requireContains(dispatch, dispatchPath, [
  'input: CommandExecutionInput',
  'signal: input.signal',
]);
forbidContains(dispatch, dispatchPath, [
  'resolveWorkingRevisionStore',
  'ensureStoredRevision',
  'BorrowedBytesSource',
]);

const fileAdapterPath = 'src/adapters/file/FileAdapter.ts';
const fileAdapter = read(fileAdapterPath);
requireContains(fileAdapter, fileAdapterPath, [
  'bytes.byteOffset === 0',
  'bytes.byteLength === bytes.buffer.byteLength',
  'bytes.buffer instanceof ArrayBuffer',
  'return bytes.buffer',
]);

const borrowedTestPath =
  'src/adapters/document-source/BorrowedBytesSource.test.ts';
const borrowedTest = read(borrowedTestPath);
requireContains(borrowedTest, borrowedTestPath, [
  'borrows the full input without a construction clone',
  'returns owned ranges',
]);

const transactionTestPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const transactionTest = read(transactionTestPath);
requireContains(transactionTest, transactionTestPath, [
  'publishes a revision before commit and restores revision identity through undo/redo',
  'aborts before annotation persistence and state commit when revision publication fails',
  "activeRevisionId: 'hash-2'",
  "activeRevisionId: 'hash-1'",
]);

for (const relativePath of [
  borrowedPath,
]) {
  const lineCount = read(relativePath).split('\n').length;
  if (lineCount > 300) {
    fail(
      `${relativePath} exceeds the Phase 8C production module limit: ${lineCount} lines`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-mutation-revision] revision-first transaction, cancellation, history identity and no-copy publication guards passed',
);
