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
    '[phase8-search-index] ' + message,
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
        relativePath
        + ' missing required marker: '
        + marker,
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
        relativePath
        + ' contains forbidden marker: '
        + marker,
      );
    }
  }
}

const typesPath =
  'src/core/search/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  "export type SearchPageIndexStatus =",
  "'unindexed'",
  "'queued'",
  "'indexing'",
  "'indexed'",
  "'failed'",
  'export interface SearchIndexProgress',
  'revisionId: string | null',
  'indexedPages: number',
  'failedPages: number',
  'pendingPages: number',
  'totalPages: number',
  'complete: boolean',
  'EMPTY_SEARCH_INDEX_PROGRESS',
  'indexProgress: SearchIndexProgress',
]);

const storePath =
  'src/core/search/store.ts';
const store = read(storePath);
requireContains(store, storePath, [
  'setIndexProgress:',
  'EMPTY_SEARCH_INDEX_PROGRESS',
  'indexProgress:',
]);
forbidContains(store, storePath, [
  'PDFDocumentProxy',
  'PdfRendererAdapter',
  'getPage(',
]);

const matcherPath =
  'src/core/search/searchIndexedPageText.ts';
const matcher = read(matcherPath);
requireContains(matcher, matcherPath, [
  'searchIndexedPageText',
  'pageId: PageId',
  'revisionId: string',
  'pageNumber: number',
  'options: SearchOptions',
  'regex.exec(fullText)',
]);
forbidContains(matcher, matcherPath, [
  'pdfjs-dist',
  'PDFDocumentProxy',
  'useSearchStore',
  'useSessionStore',
]);

const indexPath =
  'src/core/search/indexer.ts';
const indexer = read(indexPath);
requireContains(indexer, indexPath, [
  'Map<PageId, SearchIndexPageRecord>',
  'let activeRevisionId: string | null',
  'static prepareRevision(',
  'activeRevisionId !== revisionId',
  'revisionIndexes.clear()',
  'static getPageState(',
  'static markQueued(',
  'static markIndexing(',
  'record.ownerToken !== ownerToken',
  'static setPageText(',
  'static releaseOwner(',
  'static getProgress(',
  'static searchPage(',
  'static searchRevision(',
  'searchIndexedPageText({',
  'pageId: page.pageId',
  'pageNumber: pageIndex + 1',
  'static createPageSchedule(',
  'push(currentPage)',
  'push(currentPage - distance)',
  'push(currentPage + distance)',
  'input.requestedPageNumbers',
]);
forbidContains(indexer, indexPath, [
  'pdfjs-dist',
  'PDFDocumentProxy',
  'useSearchStore',
  'useSessionStore',
  'getPage(',
  'localStorage',
  'indexedDB',
]);

const adapterPath =
  'src/adapters/pdf-renderer/IncrementalSearchIndexer.ts';
const adapter = read(adapterPath);
requireContains(adapter, adapterPath, [
  'indexPdfDocumentIncrementally',
  'SearchIndexer.createPageSchedule',
  'SearchIndexer.getPageState',
  'SearchIndexer.markQueued',
  'SearchIndexer.markIndexing',
  'owned.ownerToken',
  'input.doc.getPage(pageNumber)',
  'PdfRendererAdapter',
  '.getPageTextItems(',
  'SearchIndexer.setPageText',
  'SearchIndexer.markFailed',
  'SearchIndexer.releaseOwner',
  'await yieldToBrowser(',
  'batchSize',
  'page?.cleanup()',
  'throwIfAborted(',
]);
forbidContains(adapter, adapterPath, [
  'useSessionStore',
  'useSearchStore',
  'materializeDocumentSource',
  'workingBytes',
  'SearchIndexer.getPageRecord(',
]);

const panelPath =
  'src/components/sidebar/SearchPanel.tsx';
const panel = read(panelPath);
requireContains(panel, panelPath, [
  'acquireActivePdfDocumentLease',
  'indexPdfDocumentIncrementally',
  'SearchIndexer.prepareRevision(',
  'useSearchResultPublisher({',
  'publishIndexedPageResults(',
  'activeRevisionId',
  'pageGraph',
  'currentPage',
  'nearbyRadius: 2',
  'batchSize: 2',
  'onPageIndexed:',
  'indexProgress.indexedPages',
  'indexProgress.totalPages',
  'background indexing continues',
  'await lease?.release()',
]);
forbidContains(panel, panelPath, [
  'searchDocumentTextInDocument(',
  'searchDocumentText(',
  'SearchIndexer.getCache(',
  'SearchIndexer.setCache(',
  'PdfRendererAdapter.acquireDocument(',
  'PdfRendererAdapter.acquireDocumentSource(',
  'SearchIndexer.searchRevision(',
]);

const topNavPath =
  'src/components/shell/TopNav.tsx';
const topNav = read(topNavPath);
requireContains(topNav, topNavPath, [
  'setQuery(value)',
  'setSidebarTab',
  "setSidebarTab('search')",
]);
forbidContains(topNav, topNavPath, [
  'SearchIndexer',
  'PdfRendererAdapter',
  'searchDocumentText',
  'indexPdfDocumentIncrementally',
  'acquireActivePdfDocumentLease',
]);

const workspacePath =
  'src/components/workspace/DocumentWorkspace.tsx';
const workspace = read(workspacePath);
forbidContains(workspace, workspacePath, [
  'IncrementalSearchIndexer',
  'indexPdfDocumentIncrementally',
  'SearchIndexer.prepareRevision(',
]);

const admissionPath =
  'src/core/admission/openPdf.ts';
const admission = read(admissionPath);
forbidContains(admission, admissionPath, [
  'IncrementalSearchIndexer',
  'indexPdfDocumentIncrementally',
  'SearchIndexer',
]);

const indexTestPath =
  'src/core/search/indexer.test.ts';
const indexTests = read(indexTestPath);
requireContains(indexTests, indexTestPath, [
  'prioritizes current, nearby, requested, then remaining pages',
  'searches only indexed pages and exposes partial progress',
  'reuses PageId text after same-revision reorder and remaps result page numbers',
  'invalidates stale page text when the active revision changes',
  'prevents a superseded task token from publishing page text',
  'supports case, whole-word and regex query options without reindexing',
]);

const adapterTestPath =
  'src/adapters/pdf-renderer/IncrementalSearchIndexer.test.ts';
const adapterTests = read(adapterTestPath);
requireContains(adapterTests, adapterTestPath, [
  'indexes current and nearby pages before distant background pages and publishes partial hits',
  'yields between bounded batches so cancellation prevents distant page extraction',
  'does not reacquire text for pages already indexed in the same revision',
]);

const panelTestPath =
  'src/components/sidebar/SearchPanel.test.tsx';
const panelTests = read(panelTestPath);
requireContains(panelTests, panelTestPath, [
  'uses the active revision lease and incremental indexer without a query-triggered full-document scan',
  'publishes partial hits while background indexing remains incomplete',
  'reuses indexed text across query changes without restarting extraction',
]);

const incrementalResultsTestPath =
  'src/core/search/incrementalResults.test.ts';
const incrementalResultsTests =
  read(incrementalResultsTestPath);
requireContains(
  incrementalResultsTests,
  incrementalResultsTestPath,
  [
    'matches exactly one newly indexed page per active-query arrival across 1000 pages',
    '.toHaveBeenCalledTimes(1000)',
    'requires rebuild after a query or PageGraph signature changes',
  ],
);

const storeTestPath =
  'src/core/search/store.test.ts';
const storeTests = read(storeTestPath);
requireContains(storeTests, storeTestPath, [
  'retains revision index progress when the query is cleared',
]);

const inheritedGuardPath =
  'scripts/phase8-active-renderer-consumers-audit.mjs';
const inheritedGuard =
  read(inheritedGuardPath);
requireContains(
  inheritedGuard,
  inheritedGuardPath,
  [
    'indexPdfDocumentIncrementally',
    'useSearchResultPublisher',
    'IncrementalSearchIndexer.test.ts',
  ],
);
forbidContains(
  inheritedGuard,
  inheritedGuardPath,
  [
    "'PdfRendererAdapter.searchDocumentTextInDocument(',\n  'SearchIndexer.getCache(documentKey)'",
  ],
);

const lifecyclePath =
  '../docs/PDFJS_DOCUMENT_LIFECYCLE.md';
const lifecycle = read(lifecyclePath);
requireContains(lifecycle, lifecyclePath, [
  'incrementally extracts current/nearby pages',
  'immutable active revision plus stable PageId',
  'SearchPanel owns the active indexing',
  'yields between bounded batches',
  'A revision change invalidates the runtime index',
]);

const architecturePath =
  '../ARCHITECTURE.md';
const architecture = read(architecturePath);
requireContains(
  architecture,
  architecturePath,
  [
    'Phase 8F replaces query-triggered whole-document search extraction',
    'activeRevisionId + PageId',
    'current page first',
    'partial hits are visible',
    'TopNav only updates the shared query',
    'process-local',
    'WP-8G owns the large-document performance corpus',
  ],
);

const packagePath = 'package.json';
const packageJson =
  JSON.parse(read(packagePath));
const auditCommand =
  packageJson.scripts[
    'audit:phase8-search-index'
  ];
const certifyCommand =
  packageJson.scripts[
    'certify:phase8f'
  ];
if (
  auditCommand
  !== 'node scripts/phase8-search-index-audit.mjs'
) {
  fail(
    'package.json audit:phase8-search-index is missing or changed.',
  );
}
requireContains(
  certifyCommand ?? '',
  packagePath,
  [
    'npm run certify:phase8e-closure',
    'npm run audit:phase8-search-index',
    'src/core/search/indexer.test.ts',
    'src/core/search/store.test.ts',
    'src/adapters/pdf-renderer/IncrementalSearchIndexer.test.ts',
    'src/components/sidebar/SearchPanel.test.tsx',
    'src/components/shell/TopNav.test.tsx',
    'npm run build',
  ],
);

const phase8d3 =
  packageJson.scripts[
    'certify:phase8d3'
  ] ?? '';
requireContains(
  phase8d3,
  packagePath,
  [
    'src/components/sidebar/SearchPanel.test.tsx',
    'src/adapters/pdf-renderer/IncrementalSearchIndexer.test.ts',
  ],
);

const limits = [
  [matcherPath, matcher, 200],
  [indexPath, indexer, 520],
  [
    'src/core/search/incrementalResults.ts',
    read('src/core/search/incrementalResults.ts'),
    180,
  ],
  [adapterPath, adapter, 320],
  [
    'src/components/sidebar/useSearchResultPublisher.ts',
    read('src/components/sidebar/useSearchResultPublisher.ts'),
    220,
  ],
  [panelPath, panel, 500],
];

for (
  const [relativePath, source, limit]
  of limits
) {
  const lineCount =
    source.split('\n').length;
  if (lineCount > limit) {
    fail(
      relativePath
      + ' exceeds '
      + limit
      + ' lines ('
      + lineCount
      + ').',
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-search-index] revision/PageId incremental search indexing guards passed',
);
