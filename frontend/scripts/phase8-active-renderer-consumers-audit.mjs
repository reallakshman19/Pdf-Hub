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

const rendererTestPath =
  'src/adapters/pdf-renderer/PdfRendererAdapter.test.ts';
const rendererTest = read(rendererTestPath);
requireContains(rendererTest, rendererTestPath, [
  'extracts text-layer items from an already-loaded PDF page',
  'flattens loaded-document outline destinations without reacquiring the PDF',
  'loads a DocumentSource through PDF.js range transport without whole-source reads',
  'reuses one source-backed PDF.js document for the same revision key',
  'getDocumentSourceCacheDiagnostics',
  'cancels an active PDF.js render task when its signal aborts',
]);

const searchPath =
  'src/components/sidebar/SearchPanel.tsx';
const search = read(searchPath);
requireContains(search, searchPath, [
  'acquireActivePdfDocumentLease',
  'indexPdfDocumentIncrementally',
  'SearchIndexer.searchRevision(',
  'activeRevisionId',
  'pageGraph',
  'currentPage',
  'batchSize: 2',
  'onPageIndexed:',
  'await lease?.release()',
]);
forbidContains(search, searchPath, [
  'PdfRendererAdapter.searchDocumentTextInDocument(',
  'PdfRendererAdapter.searchDocumentText(',
  'SearchIndexer.getCache(',
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
  'selectionOperationIdRef',
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

const incrementalSearchPath =
  'src/adapters/pdf-renderer/IncrementalSearchIndexer.ts';
const incrementalSearch =
  read(incrementalSearchPath);
requireContains(
  incrementalSearch,
  incrementalSearchPath,
  [
    'SearchIndexer.createPageSchedule',
    'SearchIndexer.markQueued',
    'SearchIndexer.markIndexing',
    'SearchIndexer.setPageText',
    'SearchIndexer.releaseOwner',
    'await yieldToBrowser(',
    'page?.cleanup()',
  ],
);

const searchTestPath =
  'src/components/sidebar/SearchPanel.test.tsx';
const searchTest = read(searchTestPath);
requireContains(searchTest, searchTestPath, [
  'uses the active revision lease and incremental indexer without a query-triggered full-document scan',
  'publishes partial hits while background indexing remains incomplete',
  'reuses indexed text across query changes without restarting extraction',
]);

const incrementalSearchTestPath =
  'src/adapters/pdf-renderer/IncrementalSearchIndexer.test.ts';
const incrementalSearchTest =
  read(incrementalSearchTestPath);
requireContains(
  incrementalSearchTest,
  incrementalSearchTestPath,
  [
    'indexes current and nearby pages before distant background pages and publishes partial hits',
    'yields between bounded batches so cancellation prevents distant page extraction',
    'does not reacquire text for pages already indexed in the same revision',
  ],
);

const bookmarksTestPath =
  'src/components/sidebar/panels/BookmarksSidebar.test.tsx';
const bookmarksTest = read(bookmarksTestPath);
requireContains(bookmarksTest, bookmarksTestPath, [
  'loads the native outline through an active revision lease and releases it',
]);

const thumbnailTestPath =
  'src/components/sidebar/panels/ThumbnailSidebar.test.tsx';
const thumbnailTest = read(thumbnailTestPath);
requireContains(thumbnailTest, thumbnailTestPath, [
  'renders scheduled thumbnails and handles keyboard navigation and selection',
  'acquireScheduledThumbnail',
]);
forbidContains(thumbnailTest, thumbnailTestPath, [
  "it.skip(",
  'PdfRendererAdapter.acquireDocument',
  'PdfRendererAdapter.getThumbnail',
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
  'keeps the busy indicator for the newest selection after superseding an older one',
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
  'pdfPageLabels.test.ts',
  'pageGraphAdmission.test.ts',
  'DocumentWorkspace.test.tsx',
  'documentTransaction.history.test.ts',
  'SearchPanel.test.tsx',
  'IncrementalSearchIndexer.test.ts',
  'BookmarksSidebar.test.tsx',
  'ThumbnailSidebar.test.tsx',
  'SelectBoxCopyLayer.test.tsx',
  'selectBoxCopyEngine.test.ts',
  'imageSnapshot.test.ts',
]);

const moduleLimits = [
  [leasePath, lease, 120],
  [rendererPath, renderer, 600],
  [incrementalSearchPath, incrementalSearch, 320],
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
  '[phase8-active-renderer-consumers] active incremental Search/Bookmarks/Select Box revision leases, cancellation cleanup and byte-wrapper compatibility guards passed',
);
