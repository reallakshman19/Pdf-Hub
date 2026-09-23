import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  execFileSync,
} from 'node:child_process';

import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';

export interface Phase8gFixtureRecord {
  fixture_id: string;
  kind: string;
  page_count: number;
  filename: string;
  bytes: number;
  sha256: string;
}

export interface Phase8gFixtureManifest {
  generated: Phase8gFixtureRecord[];
}

export interface Phase8gObservation {
  fixture_id: string;
  fixture_sha256: string;
  operation: string;
  page_count: number;
  elapsed_ms: number;
  metrics: Record<
    string,
    string | number | boolean | null
  >;
}

export const PHASE8G_RUN =
  process.env.PHASE8G_BENCHMARK
  === '1';

export const PHASE8G_FIXTURE_DIR =
  path.resolve(
    process.cwd(),
    process.env.PHASE8G_FIXTURE_DIR
      ?? 'performance/fixtures/phase8g',
  );

export function phase8gSelected(
  fixture: Phase8gFixtureRecord,
): boolean {
  const kinds =
    process.env.PHASE8G_KINDS
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  const pages =
    process.env.PHASE8G_PAGES
      ?.split(',')
      .map(Number)
      .filter(Number.isInteger);

  return (
    (!kinds || kinds.includes(fixture.kind))
    && (
      !pages
      || pages.includes(fixture.page_count)
    )
  );
}

export async function loadPhase8gFixtures():
Promise<Phase8gFixtureRecord[]> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        path.join(
          PHASE8G_FIXTURE_DIR,
          'manifest.json',
        ),
        'utf8',
      ),
    ) as Phase8gFixtureManifest;
  return manifest.generated
    .filter(phase8gSelected);
}

export async function readPhase8gFixture(
  fixture: Phase8gFixtureRecord,
): Promise<Uint8Array> {
  return Uint8Array.from(
    await fs.readFile(
      path.join(
        PHASE8G_FIXTURE_DIR,
        fixture.filename,
      ),
    ),
  );
}

export function phase8gPageGraph(
  revisionId: string,
  count: number,
): PageGraph<PageNode> {
  return {
    pages: Array.from(
      { length: count },
      (_, index) => ({
        pageId:
          'phase8g-page-'
          + (index + 1),
        documentKey: revisionId,
        originalPageNumber:
          index + 1,
        currentIndex: index,
        width: 595.28,
        height: 841.89,
        rotation: 0 as const,
      }),
    ),
  };
}

export async function measurePhase8g<T>(
  operation: () => Promise<T>,
): Promise<{
  value: T;
  elapsedMs: number;
  peakMemoryBytes: number;
}> {
  let peakMemoryBytes =
    process.memoryUsage().rss;
  const timer =
    setInterval(() => {
      peakMemoryBytes =
        Math.max(
          peakMemoryBytes,
          process.memoryUsage().rss,
        );
    }, 10);
  const started =
    performance.now();

  try {
    const value =
      await operation();
    peakMemoryBytes =
      Math.max(
        peakMemoryBytes,
        process.memoryUsage().rss,
      );
    return {
      value,
      elapsedMs:
        performance.now()
        - started,
      peakMemoryBytes,
    };
  } finally {
    clearInterval(timer);
  }
}

function gitHead(): string {
  return execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  ).trim();
}

export function phase8gNodeEnvironment() {
  const cpus = os.cpus();
  return {
    commit_sha: gitHead(),
    runtime: 'node',
    runtime_version: process.version,
    browser:
      'not-applicable-node-driver',
    browser_version:
      'not-applicable',
    os:
      os.platform()
      + ' '
      + os.release(),
    cpu:
      cpus[0]?.model
      ?? 'unknown',
    logical_cores: cpus.length,
    memory_bytes: os.totalmem(),
  };
}

export async function writePhase8gObservation(
  outputPath: string,
  measurements:
    readonly Phase8gObservation[],
): Promise<void> {
  const resolved =
    path.resolve(
      process.cwd(),
      outputPath,
    );
  await fs.mkdir(
    path.dirname(resolved),
    {
      recursive: true,
    },
  );
  await fs.writeFile(
    resolved,
    JSON.stringify(
      {
        schema_version:
          'phase8g-benchmark-observation-v1',
        environment:
          phase8gNodeEnvironment(),
        measurements,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}
