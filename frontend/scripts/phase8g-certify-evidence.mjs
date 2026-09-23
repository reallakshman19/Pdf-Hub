import path from 'node:path';

import {
  phase8gArgValue,
  phase8gGitHead,
  phase8gLoadJson,
  phase8gResultMap,
  validatePhase8gReport,
  verifyPhase8gBrowser,
  verifyPhase8gNodeMatrix,
  writePhase8gCertificationEvidence,
} from './phase8g-certification-evidence-support.mjs';

const root = process.cwd();

const nodeReportPath =
  phase8gArgValue(
    'node-report',
  )
  ?? process.env
    .PHASE8G_NODE_REPORT_PATH
  ?? 'performance/results/phase8g-node-report.json';
const browserReportPath =
  phase8gArgValue(
    'browser-report',
  )
  ?? process.env
    .PHASE8G_BROWSER_REPORT_PATH
  ?? 'performance/results/phase8g-browser-report.json';
const outputPath =
  phase8gArgValue('out')
  ?? process.env
    .PHASE8G_CERTIFICATION_EVIDENCE_PATH
  ?? 'performance/results/phase8g-certification-evidence.json';

const budget =
  phase8gLoadJson(
    root,
    'performance/phase8g-budget-manifest.json',
  );
const nodeReport =
  phase8gLoadJson(
    root,
    nodeReportPath,
  );
const browserReport =
  phase8gLoadJson(
    root,
    browserReportPath,
  );
const head =
  phase8gGitHead(root);
const failures = [];

validatePhase8gReport({
  report: nodeReport,
  name: 'node',
  budget,
  head,
  failures,
});
validatePhase8gReport({
  report: browserReport,
  name: 'browser',
  budget,
  head,
  failures,
});

const nodeResults =
  phase8gResultMap(
    nodeReport,
  );
const browserResults =
  phase8gResultMap(
    browserReport,
  );

const nodeOperations = [
  'range_backed_first_page',
  'incremental_indexing',
  'active_query_page_arrival_matching',
  'query_change_reextraction',
  'cancellation_reprioritization',
  'mutation_rotate',
  'mutation_reorder',
  'mutation_delete',
  'mutation_duplicate',
  'mutation_insert_donor',
  'mutation_replace_donor',
  'mutation_append_donor',
  'save_export',
  'recovery_restore',
];

const expectedFixtureCount =
  verifyPhase8gNodeMatrix({
    budget,
    nodeResults,
    operations:
      nodeOperations,
    failures,
  });

const browserFixture =
  'phase8g:native_text:1000';
verifyPhase8gBrowser({
  browserResults,
  fixtureId:
    browserFixture,
  operations: [
    'range_backed_first_page',
    'browser_navigation',
    'long_task',
  ],
  failures,
});

const complexity =
  nodeResults.get(
    browserFixture
    + '|active_query_page_arrival_matching',
  );
if (
  complexity
  && complexity.details
    ?.observed !== 1
) {
  failures.push(
    '1000-page active-query match ratio must equal 1; observed '
    + String(
      complexity.details
        ?.observed,
    ),
  );
}

const evidence = {
  schema_version:
    'phase8g-certification-evidence-v1',
  commit_sha: head,
  budget_schema_version:
    budget.schema_version,
  node_report:
    path.basename(
      nodeReportPath,
    ),
  browser_report:
    path.basename(
      browserReportPath,
    ),
  expected_fixture_count:
    expectedFixtureCount,
  required_node_operations:
    nodeOperations,
  browser_fixture:
    browserFixture,
  status:
    failures.length === 0
      ? 'PASS'
      : 'FAIL',
  failures,
};

writePhase8gCertificationEvidence({
  root,
  outputPath,
  evidence,
});

if (
  evidence.status !== 'PASS'
) {
  for (
    const failure
    of failures
  ) {
    console.error(
      '[phase8g-certification] '
      + failure,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    '[phase8g-certification] exact-head benchmark evidence passed for '
    + head,
  );
}
