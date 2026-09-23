import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  execFileSync,
} from 'node:child_process';

import {
  expect,
  test,
} from '@playwright/test';
import {
  stubNativeFilePickers,
} from './fixtures/stubNativeFilePickers';
import {
  jumpToPhase8gPage,
  phase8gMedian,
  phase8gRendererDiagnostics,
  waitForPhase8gRenderedPage,
} from './phase8gBrowserBenchmarkSupport';

interface FixtureRecord {
  fixture_id: string;
  kind: string;
  page_count: number;
  filename: string;
  bytes: number;
  sha256: string;
}

interface FixtureManifest {
  generated: FixtureRecord[];
}

interface Observation {
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

test(
  'Phase 8G browser render/navigation performance observation',
  async ({
    page,
    browserName,
  }) => {
    test.skip(
      process.env
        .PHASE8G_BROWSER_BENCHMARK
        !== '1',
      'Phase 8G browser benchmark is opt-in.',
    );

    const manifest =
      JSON.parse(
        await fs.readFile(
          path.join(
            FIXTURE_DIR,
            'manifest.json',
          ),
          'utf8',
        ),
      ) as FixtureManifest;
    const pageCount =
      Number(
        process.env
          .PHASE8G_BROWSER_PAGE_COUNT
        ?? 1000,
      );
    const fixture =
      manifest.generated.find(
        (candidate) =>
          candidate.kind
            === 'native_text'
          && candidate.page_count
            === pageCount,
      );
    if (!fixture) {
      throw new Error(
        `Missing native_text ${pageCount}-page Phase 8G fixture.`,
      );
    }

    const bytes =
      await fs.readFile(
        path.join(
          FIXTURE_DIR,
          fixture.filename,
        ),
      );

    await page.addInitScript(
      () => {
        const holder =
          window as unknown as {
            __phase8gLongTasks?: number[];
          };
        holder.__phase8gLongTasks = [];
        try {
          const observer =
            new PerformanceObserver(
              (list) => {
                holder
                  .__phase8gLongTasks
                  ?.push(
                    ...list
                      .getEntries()
                      .map(
                        (entry) =>
                          entry.duration,
                      ),
                  );
              },
            );
          observer.observe({
            type: 'longtask',
            buffered: true,
          });
        } catch {
          // Browser lacks Long Tasks API.
        }
      },
    );

    const cdp =
      await page
        .context()
        .newCDPSession(page);
    await cdp.send(
      'Performance.enable',
    );
    const heapSample =
      async () => {
        const metrics =
          await cdp.send(
            'Performance.getMetrics',
          );
        return (
          metrics.metrics.find(
            (metric) =>
              metric.name
              === 'JSHeapUsedSize',
          )?.value
          ?? 0
        );
      };

    const heapSamples: number[] =
      [await heapSample()];

    await stubNativeFilePickers(
      page,
    );
    await page.goto('/');
    await page
      .getByRole(
        'button',
        {
          name: 'Browse Files',
        },
      )
      .waitFor({
        state: 'visible',
      });

    const scenarioStarted =
      performance.now();
    const [chooser] =
      await Promise.all([
        page.waitForEvent(
          'filechooser',
        ),
        page
          .getByRole(
            'button',
            {
              name:
                'Browse Files',
            },
          )
          .click(),
      ]);
    const admissionStarted =
      performance.now();
    await chooser.setFiles({
      name:
        fixture.filename,
      mimeType:
        'application/pdf',
      buffer:
        Buffer.from(bytes),
    });

    await waitForPhase8gRenderedPage(
      page,
      1,
    );
    const firstPageMs =
      performance.now()
      - admissionStarted;
    heapSamples.push(
      await heapSample(),
    );

    const firstDiagnostics =
      await phase8gRendererDiagnostics(
        page,
      );
    const sourceDiagnostic =
      firstDiagnostics.find(
        (entry) =>
          entry.sourceSize
            === bytes.byteLength
          && entry.sourceKind
            === 'browser-file',
      );
    if (!sourceDiagnostic) {
      throw new Error(
        'No browser-file PDF.js source diagnostics were available after first-page render.',
      );
    }

    const targets =
      Array.from(
        new Set([
          pageCount,
          Math.max(
            1,
            Math.floor(
              pageCount / 2,
            ),
          ),
          Math.max(
            1,
            pageCount - 1,
          ),
          2,
          1,
        ]),
      );
    const latencies: number[] =
      [];
    for (
      const target of targets
    ) {
      latencies.push(
        await jumpToPhase8gPage(
          page,
          target,
        ),
      );
      heapSamples.push(
        await heapSample(),
      );
    }

    const longTasks =
      await page.evaluate(
        () =>
          (
            window as unknown as {
              __phase8gLongTasks?:
                number[];
            }
          )
            .__phase8gLongTasks
          ?? [],
      );
    const browserVersion =
      page.context()
        .browser()
        ?.version()
      ?? 'unknown';
    const logicalCores =
      await page.evaluate(
        () =>
          navigator
            .hardwareConcurrency
          || 1,
      );

    const observations:
      Observation[] = [{
        fixture_id:
          fixture.fixture_id,
        fixture_sha256:
          fixture.sha256,
        operation:
          'range_backed_first_page',
        page_count:
          fixture.page_count,
        elapsed_ms:
          firstPageMs,
        metrics: {
          file_bytes:
            bytes.byteLength,
          range_bytes_before_first_page:
            sourceDiagnostic
              .rangeBytesDelivered,
          range_requests:
            sourceDiagnostic
              .rangeRequests,
          max_requested_range_bytes:
            sourceDiagnostic
              .maxRequestedRangeBytes,
          peak_js_heap_bytes:
            Math.max(
              ...heapSamples,
            ),
          measurement_surface:
            'browser-rasterized-page',
        },
      }, {
        fixture_id:
          fixture.fixture_id,
        fixture_sha256:
          fixture.sha256,
        operation:
          'browser_navigation',
        page_count:
          fixture.page_count,
        elapsed_ms:
          latencies.reduce(
            (sum, value) =>
              sum + value,
            0,
          ),
        metrics: {
          max_navigation_ms:
            Math.max(
              ...latencies,
            ),
          median_navigation_ms:
            phase8gMedian(latencies),
          navigation_samples:
            latencies.length,
          peak_js_heap_bytes:
            Math.max(
              ...heapSamples,
            ),
        },
      }, {
        fixture_id:
          fixture.fixture_id,
        fixture_sha256:
          fixture.sha256,
        operation:
          'long_task',
        page_count:
          fixture.page_count,
        elapsed_ms:
          performance.now()
          - scenarioStarted,
        metrics: {
          max_long_task_ms:
            longTasks.length > 0
              ? Math.max(
                  ...longTasks,
                )
              : 0,
          long_task_count:
            longTasks.length,
        },
      }];

    await fs.mkdir(
      path.dirname(
        OUTPUT_PATH,
      ),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      OUTPUT_PATH,
      JSON.stringify(
        {
          schema_version:
            'phase8g-benchmark-observation-v1',
          environment: {
            commit_sha:
              gitHead(),
            runtime:
              'browser',
            runtime_version:
              browserVersion,
            browser:
              browserName,
            browser_version:
              browserVersion,
            os:
              os.platform()
              + ' '
              + os.release(),
            cpu:
              os.cpus()[0]
                ?.model
              ?? 'unknown',
            logical_cores:
              logicalCores,
            memory_bytes:
              os.totalmem(),
          },
          measurements:
            observations,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    expect(observations)
      .toHaveLength(3);
  },
);
