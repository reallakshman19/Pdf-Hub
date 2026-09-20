import fs from 'node:fs';
import path from 'node:path';
import {
  execFileSync,
} from 'node:child_process';

const root = process.cwd();

function argValue(name) {
  const prefix = '--' + name + '=';
  return process.argv
    .slice(2)
    .find(
      (arg) =>
        arg.startsWith(prefix),
    )
    ?.slice(prefix.length)
    ?? null;
}

function loadJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(
        root,
        relativePath,
      ),
      'utf8',
    ),
  );
}

function gitHead() {
  return execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  ).trim();
}

const nodeReportPath =
  argValue('node-report')
  ?? process.env
    .PHASE8G_NODE_REPORT_PATH
  ?? 'performance/results/phase8g-node-report.json';
const browserReportPath =
  argValue('browser-report')
  ?? process.env
    .PHASE8G_BROWSER_REPORT_PATH
  ?? 'performance/results/phase8g-browser-report.json';
const outputPath =
  argValue('out')
  ?? process.env
    .PHASE8G_CERTIFICATION_EVIDENCE_PATH
  ?? 'performance/results/phase8g-certification-evidence.json';

const budget =
  loadJson(
    'performance/phase8g-budget-manifest.json',
  );
const nodeReport =
  loadJson(nodeReportPath);
const browserReport =
  loadJson(browserReportPath);
const head = gitHead();
const failures = [];

function requireReport(
  report,
  name,
) {
  if (
    report.schema_version
    !== 'phase8g-benchmark-report-v1'
  ) {
    failures.push(
      name
      + ' report schema is invalid',
    );
  }
  if (
    report.budget_schema_version
    !== budget.schema_version
  ) {
    failures.push(
      name
      + ' report budget schema does not match',
    );
  }
  if (report.status !== 'PASS') {
    failures.push(
      name
      + ' report is not PASS',
    );
  }
  if (
    report.environment
      ?.commit_sha
    !== head
  ) {
    failures.push(
      name
      + ' report commit '
      + String(
        report.environment
          ?.commit_sha
        ?? '(missing)',
      )
      + ' does not equal HEAD '
      + head,
    );
  }
  if (
    !Array.isArray(
      report.results,
    )
    || report.results.length === 0
  ) {
    failures.push(
      name
      + ' report has no results',
    );
  }
}

requireReport(
  nodeReport,
  'node',
);
requireReport(
  browserReport,
  'browser',
);

function resultMap(report) {
  const map = new Map();
  for (
    const result
    of report.results ?? []
  ) {
    const key =
      result.fixture_id
      + '|'
      + result.operation;
    map.set(key, result);
  }
  return map;
}

const nodeResults =
  resultMap(nodeReport);
const browserResults =
  resultMap(browserReport);

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

let expectedFixtureCount = 0;
for (
  const [kind, fixture]
  of Object.entries(
    budget.fixtures,
  )
) {
  if (fixture.required !== true) {
    continue;
  }

  for (
    const pageCount
    of fixture.page_counts
  ) {
    expectedFixtureCount += 1;
    const fixtureId =
      'phase8g:'
      + kind
      + ':'
      + pageCount;
    for (
      const operation
      of nodeOperations
    ) {
      const result =
        nodeResults.get(
          fixtureId
          + '|'
          + operation,
        );
      if (!result) {
        failures.push(
          'node report missing '
          + fixtureId
          + ' '
          + operation,
        );
      } else if (
        result.status !== 'PASS'
      ) {
        failures.push(
          'node result failed '
          + fixtureId
          + ' '
          + operation,
        );
      }
    }
  }
}

const browserFixture =
  'phase8g:native_text:1000';
for (
  const operation
  of [
    'range_backed_first_page',
    'browser_navigation',
    'long_task',
  ]
) {
  const result =
    browserResults.get(
      browserFixture
      + '|'
      + operation,
    );
  if (!result) {
    failures.push(
      'browser report missing '
      + browserFixture
      + ' '
      + operation,
    );
  } else if (
    result.status !== 'PASS'
  ) {
    failures.push(
      'browser result failed '
      + browserFixture
      + ' '
      + operation,
    );
  }
}

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

const resolvedOutput =
  path.resolve(
    root,
    outputPath,
  );
fs.mkdirSync(
  path.dirname(
    resolvedOutput,
  ),
  {
    recursive: true,
  },
);
fs.writeFileSync(
  resolvedOutput,
  JSON.stringify(
    evidence,
    null,
    2,
  ) + '\n',
);

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
