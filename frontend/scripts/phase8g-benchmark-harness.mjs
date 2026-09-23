import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function argValue(name) {
  const prefix = '--' + name + '=';
  const value =
    process.argv
      .slice(2)
      .find(
        (arg) =>
          arg.startsWith(prefix),
      );
  return value
    ? value.slice(prefix.length)
    : null;
}

function loadJson(filePath) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      'utf8',
    ),
  );
}

const inputArg = argValue('input');
if (!inputArg) {
  throw new Error(
    'Usage: node scripts/phase8g-benchmark-harness.mjs --input=<observation.json> [--out=<report.json>]',
  );
}

const inputPath =
  path.resolve(root, inputArg);
const outputArg = argValue('out');
const outputPath =
  outputArg
    ? path.resolve(root, outputArg)
    : null;

const budget =
  loadJson(
    path.join(
      root,
      'performance',
      'phase8g-budget-manifest.json',
    ),
  );
const observation =
  loadJson(inputPath);

const errors = [];
if (
  observation.schema_version
  !== 'phase8g-benchmark-observation-v1'
) {
  errors.push(
    'observation schema_version must be phase8g-benchmark-observation-v1',
  );
}

const environment =
  observation.environment ?? {};
for (
  const field
  of budget.result_contract
    .required_environment_fields
) {
  if (
    environment[field] === undefined
    || environment[field] === null
    || environment[field] === ''
  ) {
    errors.push(
      'environment missing '
      + field,
    );
  }
}

const measurements =
  Array.isArray(
    observation.measurements,
  )
    ? observation.measurements
    : [];
if (measurements.length === 0) {
  errors.push(
    'observation has no measurements',
  );
}

function numeric(
  metrics,
  key,
  failures,
) {
  const value = metrics?.[key];
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
  ) {
    failures.push(
      'missing numeric metric '
      + key,
    );
    return null;
  }
  return value;
}

function evaluate(measurement) {
  const failures = [];
  const metrics =
    measurement.metrics ?? {};
  const operation =
    measurement.operation;
  const details = {};

  if (
    typeof measurement.page_count !== 'number'
    || !Number.isInteger(
      measurement.page_count,
    )
    || measurement.page_count < 1
  ) {
    failures.push(
      'page_count must be a positive integer',
    );
  }
  if (
    typeof measurement.elapsed_ms !== 'number'
    || !Number.isFinite(
      measurement.elapsed_ms,
    )
    || measurement.elapsed_ms < 0
  ) {
    failures.push(
      'elapsed_ms must be a non-negative number',
    );
  }

  for (
    const field
    of budget.result_contract
      .required_measurement_fields
  ) {
    if (
      measurement[field]
        === undefined
      || measurement[field]
        === null
      || measurement[field]
        === ''
    ) {
      failures.push(
        'missing measurement field '
        + field,
      );
    }
  }

  if (
    operation
    === 'active_query_page_arrival_matching'
  ) {
    const calls =
      numeric(
        metrics,
        'page_match_calls',
        failures,
      );
    const pages =
      numeric(
        metrics,
        'newly_indexed_pages',
        failures,
      );
    if (
      calls !== null
      && pages !== null
      && pages > 0
    ) {
      const ratio = calls / pages;
      details.observed =
        ratio;
      details.maximum =
        budget.budgets
          .active_query_page_arrival_matching
          .maximum;
      if (
        ratio
        > details.maximum
      ) {
        failures.push(
          `page-match ratio ${ratio} exceeds ${details.maximum}`,
        );
      }
      if (
        budget.budgets
          .active_query_page_arrival_matching
          .exact === true
        && calls !== pages
      ) {
        failures.push(
          `exact budget requires ${pages} calls; observed ${calls}`,
        );
      }
    }
  } else if (
    operation
    === 'incremental_indexing'
  ) {
    for (
      const field
      of [
        'current_page_result_ms',
        'nearby_page_result_ms',
        'pages_per_second',
        'indexed_pages',
        'failed_pages',
        'range_requests',
        'range_bytes',
        'max_requested_range_bytes',
        'peak_memory_bytes',
      ]
    ) {
      numeric(
        metrics,
        field,
        failures,
      );
    }
    details.classification =
      'OBSERVATION_ONLY';
  } else if (
    operation
    === 'query_change_reextraction'
  ) {
    const extractions =
      numeric(
        metrics,
        'pdf_text_extractions',
        failures,
      );
    details.maximum =
      budget.budgets
        .query_change_reextraction
        .maximum;
    details.observed =
      extractions;
    if (
      extractions !== null
      && extractions
        > details.maximum
    ) {
      failures.push(
        `query-change extraction count ${extractions} exceeds ${details.maximum}`,
      );
    }
  } else if (
    operation
    === 'range_backed_first_page'
  ) {
    const rangeBytes =
      numeric(
        metrics,
        'range_bytes_before_first_page',
        failures,
      );
    const fileBytes =
      numeric(
        metrics,
        'file_bytes',
        failures,
      );
    if (
      rangeBytes !== null
      && fileBytes !== null
      && fileBytes > 0
    ) {
      const fraction =
        rangeBytes / fileBytes;
      details.observed =
        fraction;
      details.maximum =
        budget.budgets
          .range_backed_first_page
          .maximum;
      if (
        measurement.page_count
          >= budget.budgets
            .range_backed_first_page
            .minimum_page_count
        && fraction
          > details.maximum
      ) {
        failures.push(
          `first-page range fraction ${fraction} exceeds ${details.maximum}`,
        );
      }
    }
  } else if (
    operation
    === 'browser_navigation'
  ) {
    for (
      const field
      of [
        'max_navigation_ms',
        'median_navigation_ms',
        'navigation_samples',
        'peak_js_heap_bytes',
      ]
    ) {
      numeric(
        metrics,
        field,
        failures,
      );
    }
    details.classification =
      'OBSERVATION_ONLY';
  } else if (
    operation === 'long_task'
  ) {
    const value =
      numeric(
        metrics,
        'max_long_task_ms',
        failures,
      );
    details.observed = value;
    details.maximum =
      budget.budgets
        .long_task
        .maximum;
    if (
      value !== null
      && value > details.maximum
    ) {
      failures.push(
        `long task ${value}ms exceeds ${details.maximum}ms`,
      );
    }
  } else if (
    operation
    === 'cancellation_reprioritization'
  ) {
    const value =
      numeric(
        metrics,
        'page_jump_reprioritization_ms',
        failures,
      );
    details.observed = value;
    details.maximum =
      budget.budgets
        .cancellation_reprioritization
        .maximum;
    if (
      value !== null
      && value > details.maximum
    ) {
      failures.push(
        `reprioritization ${value}ms exceeds ${details.maximum}ms`,
      );
    }
  } else if (
    operation === 'recovery_restore'
  ) {
    for (
      const field
      of [
        'retained_revision_storage_bytes',
        'journal_storage_bytes',
        'replayed_transactions',
        'peak_memory_bytes',
      ]
    ) {
      numeric(
        metrics,
        field,
        failures,
      );
    }
    details.classification =
      'OBSERVATION_ONLY';
  } else if (
    typeof operation === 'string'
    && (
      operation.startsWith(
        'mutation_',
      )
      || operation === 'save_export'
    )
  ) {
    for (
      const field
      of budget.budgets
        .mutation_save_truth
        .required_observations
    ) {
      if (
        metrics[field]
          === undefined
      ) {
        failures.push(
          'mutation/save measurement missing '
          + field,
        );
      }
    }
    for (
      const field
      of [
        'input_full_byte_materialization',
        'output_full_byte_materialization',
      ]
    ) {
      if (
        metrics[field] !== undefined
        && typeof metrics[field]
          !== 'boolean'
      ) {
        failures.push(
          field + ' must be boolean',
        );
      }
    }
    if (
      metrics.peak_memory_bytes
        !== undefined
      && (
        typeof metrics.peak_memory_bytes
          !== 'number'
        || !Number.isFinite(
          metrics.peak_memory_bytes,
        )
        || metrics.peak_memory_bytes < 0
      )
    ) {
      failures.push(
        'peak_memory_bytes must be a non-negative number',
      );
    }
  } else {
    failures.push(
      'unknown benchmark operation '
      + operation,
    );
  }

  return {
    fixture_id:
      measurement.fixture_id ?? null,
    fixture_sha256:
      measurement.fixture_sha256 ?? null,
    page_count:
      measurement.page_count ?? null,
    operation:
      operation ?? null,
    elapsed_ms:
      measurement.elapsed_ms ?? null,
    status:
      failures.length === 0
        ? 'PASS'
        : 'FAIL',
    details,
    failures,
  };
}

const results =
  measurements.map(evaluate);
const status =
  errors.length === 0
  && results.every(
    (result) =>
      result.status === 'PASS',
  )
    ? 'PASS'
    : 'FAIL';

const report = {
  schema_version:
    'phase8g-benchmark-report-v1',
  budget_schema_version:
    budget.schema_version,
  source_observation:
    path.basename(inputPath),
  environment,
  status,
  validation_errors: errors,
  results,
};

const serialized =
  JSON.stringify(
    report,
    null,
    2,
  ) + '\n';

if (outputPath) {
  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true },
  );
  fs.writeFileSync(
    outputPath,
    serialized,
  );
} else {
  process.stdout.write(
    serialized,
  );
}

if (status !== 'PASS') {
  process.exitCode = 1;
}
