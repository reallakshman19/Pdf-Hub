import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  PHASE8G_RUN,
  loadPhase8gFixtures,
  readPhase8gFixture,
  writePhase8gObservation,
  type Phase8gObservation,
} from './phase8gBenchmarkSupport';
import {
  observePhase8gRecovery,
} from './phase8gRecoveryBenchmarkSupport';

const describeBenchmark =
  PHASE8G_RUN
    ? describe
    : describe.skip;
const OUTPUT =
  process.env
    .PHASE8G_RECOVERY_OBSERVATION_PATH
  ?? 'performance/results/phase8g-node-recovery-observation.json';

describeBenchmark(
  'Phase 8G recovery benchmarks',
  () => {
    it(
      'records canonical recovery observations',
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
          observations.push(
            await observePhase8gRecovery(
              fixture,
              await readPhase8gFixture(
                fixture,
              ),
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
