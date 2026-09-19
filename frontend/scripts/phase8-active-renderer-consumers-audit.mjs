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
    `[phase8-active-renderer-consumers] ${message}`,
  );
}

function requireContains(
  source,
  relativePath,
  markers,
) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function forbidContains(
  source,
  relativePath,
  markers,
) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

const leasePath =
  'src/adapters/pdf-renderer/activePdfDocumentLease.ts';
const lease = read(leasePath);
requireContains(lease, leasePath, [
  'resolveActivePdfRendererInput',
  'PdfRendererAdapter.acquireDocumentSource',
  'PdfRendererAdapter.acquireDocument(',
  'input.cacheKey',
  'raceWithAbort(',
  'lateLease.release()',
]);
forbidContains(lease, leasePath, [
  'useSessionStore',
  'zustand',
  'materializeDocumentSource',
  'FileAdapter.hashBytes',
]);

const rendererPath =
  'src/adapters/pdf-renderer/PdfRendererAdapter.ts';
const renderer = read(rendererPath);
requireContains(renderer, rendererPath, [
  'static async searchDocumentTextInDocument(',
  'static async searchDocumentText(',
  'return await this.searchDocumentTextInDocument(',
]);

const searchPath =
  'src/components/sidebar/SearchPanel.tsx';
const search = read(searchPath);
requireContains(search, searchPath, [
  'acquireActivePdfDocumentLease',
  'PdfRendererAdapter.searchDocumentTextInDocument(',
  'SearchIndexer.getCache(documentKey)',
  'controller.signal',
  'await lease?.release()',
]);
forbidContains(search, searchPath, [
  'PdfRendererAdapter.searchDocumentText(',
  'PdfRendererAdapter.acquireDocument(',
  'PdfRendererAdapter.acquireDocumentSource(',
]);

const bookmarksPath =
  'src/components/sidebar/panels/BookmarksSidebar.tsx';
const bookmarks = read(bookmarksPath);
requireContains(bookmarks, bookmarksPath, [
  'acquireActivePdfDocumentLease',
  'PdfRendererAdapter.getOutlineFlat(',
  'controller.abort(',
  'await lease?.release()',
]);
forbidContains(bookmarks, bookmarksPath, [
  'PdfRendererAdapter.acquireDocument(',
  'PdfRendererAdapter.acquireDocumentSource(',
]);

const selectLayerPath =
  'src/components/select-box-copy/SelectBoxCopyLayer.tsx';
const selectLayer = read(selectLayerPath);
requireContains(selectLayer, selectLayerPath, [
  'acquireActivePdfDocumentLease',
  'extractSelectBoxCopyFromDocument',
  'renderSelectBoxImageSnapshotFromDocument',
  'operationAbortControllerRef',
  'await lease?.release()',
  'Select Box Copy renderer session changed or layer deactivated',
  'activeWriterTool,',
  'activeRevisionId,',
  'viewport.scale,',
  'viewport.rotation,',
]);
forbidContains(selectLayer, selectLayerPath, [
  'sourceBytes',
  'extractSelectBoxCopyFromPdf',
  'renderSelectBoxImageSnapshot({',
  'PdfRendererAdapter.acquireDocument(',
]);

const selectEnginePath =
  'src/core/select-box-copy/selectBoxCopyEngine.ts';
const selectEngine = read(selectEnginePath);
requireContains(selectEngine, selectEnginePath, [
  'extractSelectBoxCopyFromDocument',
  'extractSelectBoxCopyFromPdf',
  'PdfRendererAdapter.acquireDocument(input.pdfBytes)',
  'await lease.release()',
  'page.cleanup()',
]);

const imagePath =
  'src/core/select-box-copy/imageSnapshot.ts';
const image = read(imagePath);
requireContains(image, imagePath, [
  'renderSelectBoxImageSnapshotFromDocument',
  'renderSelectBoxImageSnapshot',
  'PdfRendererAdapter.acquireDocument(input.pdfBytes)',
  'await lease.release()',
  'renderTask.cancel()',
  'page.cleanup()',
]);

const leaseTestPath =
  'src/adapters/pdf-renderer/activePdfDocumentLease.test.ts';
const leaseTest = read(leaseTestPath);
requireContains(leaseTest, leaseTestPath, [
  'acquires revision-aware input through the source-backed renderer path',
  'retains the legacy byte-backed path when the resolver returns bytes',
  'releases a byte lease that resolves after cancellation',
  'does not start resolver work for an already-aborted signal',
]);

const searchTestPath =
  'src/components/sidebar/SearchPanel.test.tsx';
const searchTest = read(searchTestPath);
requireContains(searchTest, searchTestPath, [
  'uses an active revision lease for an uncached user-triggered search',
  'keeps SearchIndexer cache hits on the in-memory path without a renderer lease',
]);

const bookmarksTestPath =
  'src/components/sidebar/panels/BookmarksSidebar.test.tsx';
const bookmarksTest = read(bookmarksTestPath);
requireContains(bookmarksTest, bookmarksTestPath, [
  'loads the native outline through an active revision lease and releases it',
]);

const selectTestPath =
  'src/core/select-box-copy/selectBoxCopyEngine.test.ts';
const selectTest = read(selectTestPath);
requireContains(selectTest, selectTestPath, [
  'extracts from an already-loaded document without acquiring bytes again',
  'keeps the explicit byte wrapper and releases its lease',
]);

const imageTestPath =
  'src/core/select-box-copy/imageSnapshot.test.ts';
const imageTest = read(imageTestPath);
requireContains(imageTest, imageTestPath, [
  'renders from an already-loaded document without acquiring bytes again',
  'retains the byte wrapper and releases its lease',
]);

const selectLayerTestPath =
  'src/components/select-box-copy/SelectBoxCopyLayer.test.tsx';
const selectLayerTest = read(selectLayerTestPath);
requireContains(selectLayerTest, selectLayerTestPath, [
  'aborts in-flight Select Box renderer work when the active revision changes',
  'aborts in-flight Select Box renderer work when the tool is deactivated',
  'aborts in-flight Select Box renderer work when viewport geometry changes',
]);

const packagePath = 'package.json';
const packageJson = JSON.parse(read(packagePath));
const certifyCommand =
  packageJson.scripts?.['certify:phase8d3'] ?? '';
requireContains(certifyCommand, packagePath, [
  'PdfJsDocumentSourceTransport.test.ts',
  'PdfRendererAdapter.test.ts',
  'activePdfDocumentLease.test.ts',
  'activePdfRendererInput.test.ts',
  'DocumentWorkspace.test.tsx',
  'documentTransaction.history.test.ts',
  'SearchPanel.test.tsx',
  'BookmarksSidebar.test.tsx',
  'SelectBoxCopyLayer.test.tsx',
  'selectBoxCopyEngine.test.ts',
  'imageSnapshot.test.ts',
]);

const moduleLimits = [
  [leasePath, lease, 120],
  [rendererPath, renderer, 600],
  [selectEnginePath, selectEngine, 220],
  [imagePath, image, 220],
];

for (const [relativePath, source, limit] of moduleLimits) {
  const lineCount = source.split('\n').length;
  if (lineCount > limit) {
    fail(
      `${relativePath} exceeds ${limit} lines (${lineCount}).`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-active-renderer-consumers] active Search/Bookmarks/Select Box revision leases, cancellation cleanup and byte-wrapper compatibility guards passed',
);
