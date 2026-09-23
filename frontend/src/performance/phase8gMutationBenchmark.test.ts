import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  pdfLibMutationEngine,
} from '@/adapters/pdf-mutation/PdfLibMutationEngine';

import {
  PHASE8G_RUN,
  loadPhase8gFixtures,
  measurePhase8g,
  readPhase8gFixture,
  writePhase8gObservation,
  type Phase8gFixtureRecord,
  type Phase8gObservation,
} from './phase8gBenchmarkSupport';

const describeBenchmark =
  PHASE8G_RUN
    ? describe
    : describe.skip;
const OUTPUT =
  process.env
    .PHASE8G_MUTATION_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-mutation-observation.json';

type MutationOperation =
  | 'mutation_rotate'
  | 'mutation_reorder'
  | 'mutation_delete'
  | 'mutation_duplicate'
  | 'mutation_insert_donor'
  | 'mutation_replace_donor'
  | 'mutation_append_donor'
  | 'save_export';

async function observeMutation(
  fixture: Phase8gFixtureRecord,
  bytes: Uint8Array,
  donorBytes: Uint8Array,
  operation: MutationOperation,
): Promise<Phase8gObservation> {
  const measured =
    await measurePhase8g(
      async () => {
        const session =
          await pdfLibMutationEngine
            .open({
              bytes,
            });
        try {
          switch (operation) {
            case 'mutation_rotate':
              session.rotatePages(
                [0],
                90,
              );
              break;

            case 'mutation_reorder':
              await session
                .reorderPages(
                  Array.from(
                    {
                      length:
                        session.pageCount,
                    },
                    (_, index) =>
                      session.pageCount
                      - index
                      - 1,
                  ),
                );
              break;

            case 'mutation_delete':
              if (
                session.pageCount > 1
              ) {
                await session
                  .removePages([
                    session.pageCount
                    - 1,
                  ]);
              }
              break;

            case 'mutation_duplicate':
              await session
                .duplicatePages([0]);
              break;

            case 'mutation_insert_donor':
              await session.insertPdf(
                1,
                donorBytes,
              );
              break;

            case 'mutation_replace_donor':
              await session.replacePage(
                0,
                donorBytes,
                0,
              );
              break;

            case 'mutation_append_donor':
              await session.appendPdfs([
                donorBytes,
              ]);
              break;

            case 'save_export':
              break;
          }

          return session.commit();
        } finally {
          session.dispose();
        }
      },
    );

  return {
    fixture_id:
      fixture.fixture_id,
    fixture_sha256:
      fixture.sha256,
    operation,
    page_count:
      fixture.page_count,
    elapsed_ms:
      measured.elapsedMs,
    metrics: {
      input_full_byte_materialization:
        true,
      output_full_byte_materialization:
        true,
      input_bytes:
        bytes.byteLength,
      output_bytes:
        measured.value
          .bytes
          .byteLength,
      output_page_count:
        measured.value.pageCount,
      peak_memory_bytes:
        measured.peakMemoryBytes,
      memory_metric:
        'process.rss',
    },
  };
}

describeBenchmark(
  'Phase 8G mutation/save benchmarks',
  () => {
    it(
      'records structural mutation and save observations',
      async () => {
        const fixtures =
          await loadPhase8gFixtures();
        expect(fixtures.length)
          .toBeGreaterThan(0);

        const donorFixture =
          [...fixtures].sort(
            (left, right) =>
              left.bytes
              - right.bytes,
          )[0]!;
        const donorBytes =
          await readPhase8gFixture(
            donorFixture,
          );
        const observations:
          Phase8gObservation[] = [];
        const operations:
          MutationOperation[] = [
            'mutation_rotate',
            'mutation_reorder',
            'mutation_delete',
            'mutation_duplicate',
            'mutation_insert_donor',
            'mutation_replace_donor',
            'mutation_append_donor',
            'save_export',
          ];

        for (
          const fixture
          of fixtures
        ) {
          const bytes =
            await readPhase8gFixture(
              fixture,
            );
          for (
            const operation
            of operations
          ) {
            observations.push(
              await observeMutation(
                fixture,
                bytes,
                donorBytes,
                operation,
              ),
            );
          }
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
