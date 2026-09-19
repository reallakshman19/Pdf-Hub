import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase8-revision-store] ${message}`);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required marker: ${marker}`);
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(`${relativePath} contains forbidden marker: ${marker}`);
    }
  }
}

const corePaths = [
  'src/core/revision-store/types.ts',
  'src/core/revision-store/errors.ts',
  'src/core/revision-store/validation.ts',
  'src/core/revision-store/index.ts',
];

const productionPaths = [
  ...corePaths,
  'src/adapters/document-source/OpfsSource.ts',
  'src/adapters/revision-store/MemoryRevisionStore.ts',
  'src/adapters/revision-store/OpfsRevisionStore.ts',
  'src/adapters/revision-store/opfsRevisionIo.ts',
];

for (const relativePath of productionPaths) {
  const lineCount = read(relativePath).split('\n').length;
  if (lineCount > 300) {
    fail(`${relativePath} exceeds the Phase 8C production module limit: ${lineCount} lines`);
  }
}

for (const relativePath of corePaths) {
  const source = read(relativePath);
  forbidContains(source, relativePath, [
    '@/adapters/',
    'pdf-lib',
    "from 'react'",
    'zustand',
    '@/core/session/',
    '@/core/commands/',
  ]);
}

const typesPath = 'src/core/revision-store/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'export interface WorkingRevisionStore',
  'commit(input: CommitRevisionInput): Promise<StoredRevision>',
  'open(revisionId: string): Promise<DocumentSource>',
  'has(revisionId: string): Promise<boolean>',
  'remove(revisionId: string): Promise<void>',
  'clear(): Promise<void>',
  "export type RevisionStoreKind = 'memory' | 'opfs'",
  'readonly atomicCommit: boolean',
  'readonly persistent: boolean',
]);

const errorsPath = 'src/core/revision-store/errors.ts';
const errors = read(errorsPath);
requireContains(errors, errorsPath, [
  'export class RevisionStoreError',
  "'REVISION_EXISTS'",
  "'REVISION_NOT_FOUND'",
  "'REVISION_BUSY'",
  "'COMMIT_FAILED'",
  "'UNSUPPORTED'",
]);

const memoryPath =
  'src/adapters/revision-store/MemoryRevisionStore.ts';
const memory = read(memoryPath);
requireContains(memory, memoryPath, [
  'implements WorkingRevisionStore',
  'materializeDocumentSource',
  'Uint8Array.from(bytes)',
  'REVISION_EXISTS',
  'isOperationCancelledError',
]);
forbidContains(memory, memoryPath, [
  'pdf-lib',
  "from 'react'",
  'zustand',
  '@/core/session/',
  '@/core/commands/',
]);

const opfsSourcePath =
  'src/adapters/document-source/OpfsSource.ts';
const opfsSource = read(opfsSourcePath);
requireContains(opfsSource, opfsSourcePath, [
  'implements DocumentSource',
  "readonly kind = 'opfs'",
  'persistent: true',
  'expectedSize',
  'file.slice(offset, offset + length)',
  'OPFS revision size changed',
]);

const opfsStorePath =
  'src/adapters/revision-store/OpfsRevisionStore.ts';
const opfsStore = read(opfsStorePath);
requireContains(opfsStore, opfsStorePath, [
  'implements WorkingRevisionStore',
  'storage?.getDirectory',
  "input.directoryName ?? 'pdf-hub-revisions'",
  'encodeURIComponent(input.id)',
  'this.pending.add(input.revisionId)',
  'hasCommittedRevision',
  'commitOpfsRevisionBytes',
  'isOpfsNotFoundError',
  'isOperationCancelledError',
]);
forbidContains(opfsStore, opfsStorePath, [
  'pdf-lib',
  "from 'react'",
  'zustand',
  '@/core/session/',
  '@/core/commands/',
]);

const opfsIoPath =
  'src/adapters/revision-store/opfsRevisionIo.ts';
const opfsIo = read(opfsIoPath);
requireContains(opfsIo, opfsIoPath, [
  'commitOpfsRevisionBytes',
  'createWritable',
  'keepExistingData: false',
  'source.read(offset, length)',
  'bestEffortAbort',
  'bestEffortRemove',
  'isOpfsNotFoundError',
]);
forbidContains(opfsIo, opfsIoPath, [
  'pdf-lib',
  "from 'react'",
  'zustand',
  '@/core/session/',
  '@/core/commands/',
]);

const memoryTestPath =
  'src/adapters/revision-store/MemoryRevisionStore.test.ts';
const memoryTest = read(memoryTestPath);
requireContains(memoryTest, memoryTestPath, [
  'rejects overwrite of a committed revision id',
  'does not publish a revision when materialization fails',
  'preserves cancellation semantics without publishing bytes',
]);

const opfsTestPath =
  'src/adapters/revision-store/OpfsRevisionStore.test.ts';
const opfsTest = read(opfsTestPath);
requireContains(opfsTest, opfsTestPath, [
  'commits in bounded chunks and reopens as a persistent OPFS source',
  'removes a failed partial revision before publishing it',
  'does not expose a pending revision through has/open',
  'preserves cancellation and cleans the unpublished file',
]);

const docsPath = '../Docs/WORKING_REVISION_STORE.md';
const docs = read(docsPath);
requireContains(docs, docsPath, [
  'Immutable revision identity',
  'MemoryRevisionStore',
  'OpfsRevisionStore',
  'Phase 8C.2',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-revision-store] immutable revision contract, memory fallback, OPFS persistence, cancellation and atomic publication guards passed',
);
