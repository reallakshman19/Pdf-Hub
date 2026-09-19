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
    `[phase8-workspace-source] ${message}`,
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

const resolverPath =
  'src/core/session/activePdfRendererInput.ts';
const resolver = read(resolverPath);
requireContains(resolver, resolverPath, [
  'resolveActivePdfRendererInput',
  'revisionMetadataPresent',
  'resolveWorkingRevisionStore',
  'store.open(activeRevisionId)',
  "kind: 'source'",
  "kind: 'bytes'",
  'cacheKey: activeRevisionId',
  'activeRevisionId !== documentKey',
]);
forbidContains(resolver, resolverPath, [
  'pdfjs-dist',
  'PdfRendererAdapter',
  '@/adapters/',
  'zustand',
]);

const workspacePath =
  'src/components/workspace/DocumentWorkspace.tsx';
const workspace = read(workspacePath);
requireContains(workspace, workspacePath, [
  'resolveActivePdfRendererInput',
  'revisionStoreId: state.revisionStoreId',
  'originalRevisionId: state.originalRevisionId',
  'activeRevisionId: state.activeRevisionId',
  "rendererInput.kind === 'source'",
  'PdfRendererAdapter.acquireDocumentSource',
  'cacheKey: rendererInput.cacheKey',
  'signal: controller.signal',
  'controller.abort(',
]);

forbidContains(workspace, workspacePath, [
  'SearchIndexer',
  'PdfRendererAdapter.acquireDocument(workingBytes)',
  'for (let i = 1; i <= doc.numPages',
  'resolveWorkingRevisionStore',
]);

const resolverTestPath =
  'src/core/session/activePdfRendererInput.test.ts';
const resolverTest = read(resolverTestPath);
requireContains(resolverTest, resolverTestPath, [
  'returns legacy bytes only when all revision metadata is absent',
  'opens the immutable active revision for a revision-aware session',
  'rejects a revision-aware session with no published active revision',
  'rejects stale revision identity instead of falling back to bytes',
  'rejects an unavailable registered store instead of falling back to bytes',
]);

const workspaceTestPath =
  'src/components/workspace/DocumentWorkspace.test.tsx';
const workspaceTest = read(workspaceTestPath);
requireContains(workspaceTest, workspaceTestPath, [
  'renders continuously through the legacy byte path when revision metadata is absent',
  'loads a revision-aware workspace from the registered active revision source',
  'reacquires the renderer source when active revision changes A to B and back to A',
  "cacheKey: 'sha256:workspace'",
  "cacheKey: 'sha256:B'",
]);

const resolverLines = resolver.split('\n').length;
if (resolverLines > 140) {
  fail(
    `${resolverPath} exceeds 140 lines (${resolverLines}).`,
  );
}

if (failed) process.exit(1);

console.log(
  '[phase8-workspace-source] strict active revision resolution, source-backed workspace loading and no eager all-page indexing guards passed',
);
