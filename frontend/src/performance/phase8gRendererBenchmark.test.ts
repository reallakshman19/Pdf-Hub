import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  PdfRendererAdapter,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  SearchIndexer,
} from '@/core/search/indexer';

import {
  PHASE8G_RUN,
  loadPhase8gFixtures,
  readPhase8gFixture,
  writePhase8gObservation,
  type Phase8gObservation,
} from './phase8gBenchmarkSupport';
import {
  observePhase8gIndexing,
  observePhase8gRange,
  observePhase8gReprioritization,
} from './phase8gRendererBenchmarkSupport';

const describeBenchmark =
  PHASE8G_RUN
    ? describe
    : describe.skip;
const OUTPUT =
  process.env
    .PHASE8G_RENDERER_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-renderer-observation.json';

describeBenchmark(
  'Phase 8G renderer/search benchmarks',
  () => {
    afterEach(async () => {
      vi.restoreAllMocks();
      SearchIndexer.clearAll();
      await PdfRendererAdapter
        .clearDocumentCache({
          force: true,
        });
    });

    it(
      'records range, indexing and reprioritization observations',
      async () => {
        const fixtures =
          await loadPhase8gFixtures();
        expect(fixtures.length)
          .toBeGreaterThan(0);
        const observations:
          Phase8gObservation[] = [];

        for (
          const fixture
          of fixtures
        ) {
          const bytes =
            await readPhase8gFixture(
              fixture,
            );
          observations.push(
            await observePhase8gRange(
              fixture,
              bytes,
            ),
            ...await observePhase8gIndexing(
              fixture,
              bytes,
            ),
            await observePhase8gReprioritization(
              fixture,
              bytes,
            ),
          );
        }

        await writePhase8gObservation(
          OUTPUT,
          observations,
        );
        expect(observations.length)
          .toBeGreaterThan(0);
      },
      30 * 60 * 1000,
    );
  },
);
