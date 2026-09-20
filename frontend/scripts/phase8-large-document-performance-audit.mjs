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
    'RASTER_SIZE = 128',
    'deterministicRasterPng(',
    "zlib.deflateSync(",
    "PDFName.of('PageLabels')",
    "PDFName.of('Annots')",
    "PDFName.of('Outlines')",
    "pdf.attach(",
    "form.createTextField(",
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
    'incremental_indexing',
    'browser_navigation',
    'recovery_restore',
    'mutation_save_truth',
    "status: failures.length === 0",
  ],
);

const runnerPath =
  'scripts/phase8g-run-benchmarks.mjs';
const runner = read(runnerPath);
requireContains(
  runner,
  runnerPath,
  [
    'phase8g-generate-fixtures.mjs',
    'src/performance/phase8gRendererBenchmark.test.ts',
    'src/performance/phase8gMutationBenchmark.test.ts',
    'src/performance/phase8gRecoveryBenchmark.test.ts',
    'phase8g-merge-observations.mjs',
    'e2e/phase8g-browser-performance.spec.ts',
    'PHASE8G_SKIP_NODE',
    'PHASE8G_SKIP_BROWSER',
    'phase8g-benchmark-harness.mjs',
  ],
);

const rendererBenchmarkPath =
  'src/performance/phase8gRendererBenchmark.test.ts';
const rendererBenchmark =
  read(rendererBenchmarkPath);
const rendererSupportPath =
  'src/performance/phase8gRendererBenchmarkSupport.ts';
const rendererSupport =
  read(rendererSupportPath);
requireContains(
  rendererSupport,
  rendererSupportPath,
  [
    'PdfRendererAdapter',
    'acquireDocumentSource',
    'indexPdfDocumentIncrementally',
    'active_query_page_arrival_matching',
    'query_change_reextraction',
    'cancellation_reprioritization',
  ],
);
requireContains(
  rendererBenchmark,
  rendererBenchmarkPath,
  [
    'observePhase8gRange',
    'observePhase8gIndexing',
    'observePhase8gReprioritization',
    'writePhase8gObservation',
  ],
);

const mutationBenchmarkPath =
  'src/performance/phase8gMutationBenchmark.test.ts';
const mutationBenchmark =
  read(mutationBenchmarkPath);
requireContains(
  mutationBenchmark,
  mutationBenchmarkPath,
  [
    'pdfLibMutationEngine',
    'mutation_reorder',
    'mutation_append_donor',
    'save_export',
    'input_full_byte_materialization',
    'output_full_byte_materialization',
  ],
);

const recoveryBenchmarkPath =
  'src/performance/phase8gRecoveryBenchmark.test.ts';
const recoveryBenchmark =
  read(recoveryBenchmarkPath);
const recoverySupportPath =
  'src/performance/phase8gRecoveryBenchmarkSupport.ts';
const recoverySupport =
  read(recoverySupportPath);
requireContains(
  recoverySupport,
  recoverySupportPath,
  [
    'planHistoryRecovery',
    'resolveHistoryRecoveryPlan',
    'executeHistoryRecovery',
    'retained_revision_storage_bytes',
    'persistent-capability benchmark stores',
  ],
);
requireContains(
  recoveryBenchmark,
  recoveryBenchmarkPath,
  [
    'observePhase8gRecovery',
    'writePhase8gObservation',
  ],
);

const mergePath =
  'scripts/phase8g-merge-observations.mjs';
const merge = read(mergePath);
requireContains(
  merge,
  mergePath,
  [
    'phase8g-benchmark-observation-v1',
    'environment does not match',
    'documents.flatMap',
  ],
);

const browserBenchmarkPath =
  'e2e/phase8g-browser-performance.spec.ts';
const browserBenchmark =
  read(browserBenchmarkPath);
const browserSupportPath =
  'e2e/phase8gBrowserBenchmarkSupport.ts';
const browserSupport =
  read(browserSupportPath);
requireContains(
  browserBenchmark,
  browserBenchmarkPath,
  [
    'PerformanceObserver',
    'Performance.getMetrics',
    'phase8gRendererDiagnostics',
    'range_backed_first_page',
    'browser_navigation',
    'long_task',
    'waitForPhase8gRenderedPage',
  ],
);
requireContains(
  browserSupport,
  browserSupportPath,
  [
    'getDocumentSourceCacheDiagnostics',
    'waitForPhase8gRenderedPage',
    'jumpToPhase8gPage',
    'phase8gMedian',
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

const benchmarkModuleLimits = [
  ['src/performance/phase8gBenchmarkSupport.ts', 260],
  [rendererSupportPath, 500],
  [rendererBenchmarkPath, 180],
  [mutationBenchmarkPath, 300],
  [recoverySupportPath, 500],
  [recoveryBenchmarkPath, 160],
  [browserSupportPath, 180],
  [browserBenchmarkPath, 500],
  [runnerPath, 180],
  [harnessPath, 600],
];

for (
  const [relativePath, limit]
  of benchmarkModuleLimits
) {
  const lineCount =
    read(relativePath)
      .split('\n')
      .length;
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
if (
  packageJson.scripts
    ?.['benchmark:phase8g']
  !== 'node scripts/phase8g-run-benchmarks.mjs'
) {
  fail(
    'package.json benchmark:phase8g is missing or changed.',
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
    'npm run benchmark:phase8g',
    'Node production-path driver',
    'browser render/navigation driver',
    'OBSERVATION_ONLY',
  ],
);

if (failed) process.exit(1);

console.log(
  '[phase8-large-document-performance] corpus, budget, search-complexity and materialization-truth guards passed',
);
