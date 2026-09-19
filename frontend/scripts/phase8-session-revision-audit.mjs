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
  console.error(`[phase8-session-revision] ${message}`);
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

const registryPath =
  'src/core/revision-store/registry.ts';
const registry = read(registryPath);
requireContains(registry, registryPath, [
  'registerWorkingRevisionStore',
  'resolveWorkingRevisionStore',
  'releaseWorkingRevisionStore',
  'new Map<string, WorkingRevisionStore>()',
]);
forbidContains(registry, registryPath, [
  '@/adapters/',
  '@/core/session/',
  'zustand',
  'pdf-lib',
]);

const selectorPath =
  'src/adapters/revision-store/browserWorkingRevisionStore.ts';
const selector = read(selectorPath);
requireContains(selector, selectorPath, [
  'PRIMARY_WORKING_REVISION_STORE_ID',
  'OpfsRevisionStore.create',
  'MemoryRevisionStore',
  'pendingSelections',
  'resolveWorkingRevisionStore',
  'registerWorkingRevisionStore',
]);

const ensurePath =
  'src/core/revision-store/ensureRevision.ts';
const ensure = read(ensurePath);
requireContains(ensure, ensurePath, [
  'pendingEnsures',
  'ensureStoredRevisionUncoordinated',
  'input.store.has(input.revisionId)',
  'input.store.commit',
  "error.code === 'REVISION_EXISTS'",
  'storedSize !== incomingSize',
]);
forbidContains(ensure, ensurePath, [
  '@/adapters/',
  '@/core/session/',
  'zustand',
  'pdf-lib',
]);

const sessionTypesPath =
  'src/core/session/types.ts';
const sessionTypes = read(sessionTypesPath);
requireContains(sessionTypes, sessionTypesPath, [
  'revisionStoreId: string | null',
  'originalRevisionId: string | null',
  'activeRevisionId: string | null',
  'originalBytes: Uint8Array | null',
  'workingBytes: Uint8Array | null',
]);

const sessionStorePath =
  'src/core/session/store.ts';
const sessionStore = read(sessionStorePath);
requireContains(sessionStore, sessionStorePath, [
  'resolveWorkingRevisionStore',
  'releaseWorkingRevisionStore',
  'assertOpenRevisionMetadata',
  'activeRevisionId: null',
  'activeRevisionId !== input.documentKey',
  'nextActiveRevisionId !== nextDocumentKey',
  'originalRevisionId',
]);
if (
  !sessionStore.includes('replaceWorkingCopy:')
  || !sessionStore.includes('activeRevisionId = null')
  || !sessionStore.includes('workingBytes: bytes')
  || !sessionStore.includes('activeRevisionId,')
) {
  fail(
    'replaceWorkingCopy must default to invalidating activeRevisionId unless a published revision is explicitly supplied.',
  );
}

const openPdfPath =
  'src/core/admission/openPdf.ts';
const openPdf = read(openPdfPath);
requireContains(openPdf, openPdfPath, [
  'getBrowserWorkingRevisionStore',
  'ensureStoredRevision',
  'registerWorkingRevisionStore',
  'revisionId: documentKey',
  'revisionStoreId: revisionStore.id',
  'originalRevisionId: initialRevision.revisionId',
  'activeRevisionId: initialRevision.revisionId',
  'workingRevisionStore?: WorkingRevisionStore',
]);
const ensureIndex = openPdf.indexOf(
  'const initialRevision = await ensureStoredRevision',
);
const sourceRegisterIndex = openPdf.indexOf(
  'registerDocumentSource(documentSource)',
);
const sessionCommitIndex = openPdf.indexOf(
  'commit(payload)',
);
if (
  ensureIndex < 0
  || sourceRegisterIndex < 0
  || sessionCommitIndex < 0
  || !(ensureIndex < sourceRegisterIndex)
  || !(sourceRegisterIndex < sessionCommitIndex)
) {
  fail(
    'Primary admission must publish the working revision before registering/committing session state.',
  );
}

const openPdfTestPath =
  'src/core/admission/openPdf.test.ts';
const openPdfTest = read(openPdfTestPath);
requireContains(openPdfTest, openPdfTestPath, [
  'reuses a content-addressed initial revision on reopen',
  "revisionStoreId: 'test-working-revisions'",
  "originalRevisionId: 'sha256:fixture'",
  "activeRevisionId: 'sha256:fixture'",
]);

const sessionTestPath =
  'src/core/session/__tests__/session.test.ts';
const sessionTest = read(sessionTestPath);
requireContains(sessionTest, sessionTestPath, [
  'tracks registered immutable revision identity across working-copy changes',
  'rejects incomplete, unregistered or stale revision metadata',
  'releases the process-local revision store reference on clear',
]);

const selectorTestPath =
  'src/adapters/revision-store/browserWorkingRevisionStore.test.ts';
const selectorTest = read(selectorTestPath);
requireContains(selectorTest, selectorTestPath, [
  'coalesces concurrent initialization of the same store id',
  'falls back to memory when OPFS initialization fails',
]);

const ensureTestPath =
  'src/core/revision-store/ensureRevision.test.ts';
const ensureTest = read(ensureTestPath);
requireContains(ensureTest, ensureTestPath, [
  'coalesces concurrent publication of the same revision id',
  'fails closed if a reused revision has a different size',
]);

if (failed) process.exit(1);

console.log(
  '[phase8-session-revision] primary admission revision publication, session identity and compatibility invalidation guards passed',
);
