import {
  execFileSync,
} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function phase8gArgValue(
  name,
) {
  const prefix =
    '--' + name + '=';
  return process.argv
    .slice(2)
    .find(
      (arg) =>
        arg.startsWith(prefix),
    )
    ?.slice(prefix.length)
    ?? null;
}

export function phase8gLoadJson(
  root,
  relativePath,
) {
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

export function phase8gGitHead(
  root,
) {
  return execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  ).trim();
}

export function phase8gResultMap(
  report,
) {
  const map = new Map();
  for (
    const result
    of report.results ?? []
  ) {
    map.set(
      result.fixture_id
      + '|'
      + result.operation,
      result,
    );
  }
  return map;
}

export function validatePhase8gReport({
  report,
  name,
  budget,
  head,
  failures,
}) {
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

export function verifyPhase8gNodeMatrix({
  budget,
  nodeResults,
  operations,
  failures,
}) {
  let fixtureCount = 0;

  for (
    const [kind, fixture]
    of Object.entries(
      budget.fixtures,
    )
  ) {
    if (
      fixture.required !== true
    ) {
      continue;
    }

    for (
      const pageCount
      of fixture.page_counts
    ) {
      fixtureCount += 1;
      const fixtureId =
        'phase8g:'
        + kind
        + ':'
        + pageCount;

      for (
        const operation
        of operations
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
          result.status
          !== 'PASS'
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

  return fixtureCount;
}

export function verifyPhase8gBrowser({
  browserResults,
  fixtureId,
  operations,
  failures,
}) {
  for (
    const operation
    of operations
  ) {
    const result =
      browserResults.get(
        fixtureId
        + '|'
        + operation,
      );
    if (!result) {
      failures.push(
        'browser report missing '
        + fixtureId
        + ' '
        + operation,
      );
    } else if (
      result.status !== 'PASS'
    ) {
      failures.push(
        'browser result failed '
        + fixtureId
        + ' '
        + operation,
      );
    }
  }
}

export function writePhase8gCertificationEvidence({
  root,
  outputPath,
  evidence,
}) {
  const resolved =
    path.resolve(
      root,
      outputPath,
    );
  fs.mkdirSync(
    path.dirname(resolved),
    {
      recursive: true,
    },
  );
  fs.writeFileSync(
    resolved,
    JSON.stringify(
      evidence,
      null,
      2,
    ) + '\n',
  );
}
