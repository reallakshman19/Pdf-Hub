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
    '[phase8-large-document-performance] '
    + message,
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

const budgetPath =
  'performance/phase8g-budget-manifest.json';
const budget =
  JSON.parse(
    read(budgetPath),
  );

if (
  budget.schema_version
  !== 'phase8g-performance-budget-v1'
) {
  fail(
    'budget manifest schema_version is invalid.',
  );
}

const requiredNativeCounts =
  [100, 500, 1000, 2500, 5000];
const nativeCounts =
  budget.fixtures
    ?.native_text
    ?.page_counts
  ?? [];
for (
  const pageCount
  of requiredNativeCounts
) {
  if (!nativeCounts.includes(pageCount)) {
    fail(
      `native_text corpus missing ${pageCount}-page fixture target.`,
    );
  }
}

for (
  const kind
  of [
    'native_text',
    'image_heavy',
    'scanned_image_only',
    'mixed_geometry',
    'metadata_rich',
  ]
) {
  if (
    !budget.fixtures?.[kind]
    || budget.fixtures[kind]
      .required !== true
  ) {
    fail(
      `required fixture kind missing: ${kind}`,
    );
  }
}

const complexityBudget =
  budget.budgets
    ?.active_query_page_arrival_matching;
if (
  complexityBudget
    ?.page_count !== 1000
  || complexityBudget
    ?.maximum !== 1
  || complexityBudget
    ?.exact !== true
  || complexityBudget
    ?.complexity !== 'O(N)'
) {
  fail(
    'active-query complexity budget must require exactly one page match per 1000-page arrival.',
  );
}

if (
  budget.budgets
    ?.query_change_reextraction
    ?.maximum !== 0
) {
  fail(
    'query-change extraction budget must remain zero.',
  );
}

const generatorPath =
  'scripts/phase8g-generate-fixtures.mjs';
const generator = read(generatorPath);
requireContains(
  generator,
  generatorPath,
  [
    'FIXED_DATE',
    'native_text',
    'image_heavy',
    'scanned_image_only',
    'mixed_geometry',
    'metadata_rich',
    'phase8g-needle',
    'phase8g-fixture-manifest-v1',
    'sha256(bytes)',
    'useObjectStreams: false',
  ],
);

const harnessPath =
  'scripts/phase8g-benchmark-harness.mjs';
const harness = read(harnessPath);
requireContains(
  harness,
  harnessPath,
  [
    'phase8g-benchmark-observation-v1',
    'phase8g-benchmark-report-v1',
    'required_environment_fields',
    'active_query_page_arrival_matching',
    'page_match_calls',
    'query_change_reextraction',
    'range_backed_first_page',
    'mutation_save_truth',
    "status: failures.length === 0",
  ],
);

const indexerPath =
  'src/core/search/indexer.ts';
const indexer = read(indexerPath);
requireContains(
  indexer,
  indexerPath,
  [
    'static searchPage(',
    'searchIndexedPageText({',
    'static searchRevision(',
    'this.searchPage(',
  ],
);

const resultsPath =
  'src/core/search/incrementalResults.ts';
const results = read(resultsPath);
requireContains(
  results,
  resultsPath,
  [
    'new Map<PageId, SearchHit[]>()',
    'rebuild(',
    'updatePage(',
    'SearchIndexer.searchPage(',
    'this.hitsByPageId.set(',
    'this.flatten(pageGraph)',
  ],
);

const publisherPath =
  'src/components/sidebar/useSearchResultPublisher.ts';
const publisher = read(publisherPath);
requireContains(
  publisher,
  publisherPath,
  [
    'new IncrementalSearchResults()',
    '.rebuild(',
    '.updatePage(',
    'publishIndexedPageResults',
  ],
);
forbidContains(
  publisher,
  publisherPath,
  [
    'SearchIndexer.searchRevision(',
  ],
);

const panelPath =
  'src/components/sidebar/SearchPanel.tsx';
const panel = read(panelPath);
requireContains(
  panel,
  panelPath,
  [
    'useSearchResultPublisher({',
    'onPageIndexed:',
    'publishIndexedPageResults(',
  ],
);
forbidContains(
  panel,
  panelPath,
  [
    'SearchIndexer.searchRevision(',
  ],
);

const regressionPath =
  'src/core/search/incrementalResults.test.ts';
const regression =
  read(regressionPath);
requireContains(
  regression,
  regressionPath,
  [
    'across 1000 pages',
    '.toHaveBeenCalledTimes(1000)',
    'SearchIndexer.setPageText(',
    'results.updatePage(',
  ],
);

const transportPath =
  'src/adapters/pdf-renderer/PdfJsDocumentSourceTransport.ts';
const transport =
  read(transportPath);
requireContains(
  transport,
  transportPath,
  [
    'rangeRequests',
    'rangeBytesDelivered',
    'maxRequestedRangeBytes',
    'getDiagnostics()',
  ],
);

const mutationTypesPath =
  'src/core/pdf-mutation/types.ts';
const mutationTypes =
  read(mutationTypesPath);
requireContains(
  mutationTypes,
  mutationTypesPath,
  [
    'bytes: Uint8Array',
    'export interface PdfMutationEngineOpenInput',
    'bytes: Uint8Array;',
    'commit(): Promise<PdfMutationCommitResult>',
  ],
);

const mutationPath =
  'src/adapters/pdf-mutation/PdfLibMutationEngine.ts';
const mutation =
  read(mutationPath);
requireContains(
  mutation,
  mutationPath,
  [
    'lib.PDFDocument.load(input.bytes)',
    'this.document.save()',
    'bytes: new Uint8Array(bytes)',
  ],
);

const packageJson =
  JSON.parse(
    read('package.json'),
  );
if (
  packageJson.scripts
    ?.['generate:phase8g-fixtures']
  !== 'node scripts/phase8g-generate-fixtures.mjs'
) {
  fail(
    'package.json generate:phase8g-fixtures is missing or changed.',
  );
}
if (
  packageJson.scripts
    ?.['audit:phase8-large-document-performance']
  !== 'node scripts/phase8-large-document-performance-audit.mjs'
) {
  fail(
    'package.json audit:phase8-large-document-performance is missing or changed.',
  );
}
if (
  packageJson.scripts
    ?.['benchmark:phase8g:evaluate']
  !== 'node scripts/phase8g-benchmark-harness.mjs'
) {
  fail(
    'package.json benchmark:phase8g:evaluate is missing or changed.',
  );
}

const certify =
  packageJson.scripts
    ?.['certify:phase8g']
  ?? '';
requireContains(
  certify,
  'package.json',
  [
    'npm run certify:phase8f',
    'npm run audit:phase8-large-document-performance',
    'src/core/search/incrementalResults.test.ts',
    'src/core/search/indexer.test.ts',
    'src/components/sidebar/SearchPanel.test.tsx',
    'npm run build',
  ],
);

const docsPath =
  '../docs/PHASE8G_LARGE_DOCUMENT_PERFORMANCE.md';
const docs = read(docsPath);
requireContains(
  docs,
  docsPath,
  [
    'Runner benchmark state: NOT_RUN',
    '500,500',
    'range-backed viewing',
    'full-materialization mutation/save',
    'phase8g-budget-manifest.json',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-large-document-performance] corpus, budget, search-complexity and materialization-truth guards passed',
);
