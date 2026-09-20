import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  validateFidelityCorpusManifest,
} from './manifestValidation';
import {
  PHASE9_MUTATION_CLASSES,
  PHASE9_REQUIRED_FIXTURE_CLASSES,
  type FidelityCorpusManifest,
  type FidelityFixtureManifestEntry,
} from './types';

function allMutationExpectations() {
  return Object.fromEntries(
    PHASE9_MUTATION_CLASSES.map(
      (mutation) => [
        mutation,
        {
          disposition:
            'preserve' as const,
          rationale:
            `Preserve ${mutation} semantics.`,
          expectedStructures: [{
            structure:
              'fixture semantics',
            expected:
              'Equivalent semantics survive.',
          }],
        },
      ],
    ),
  ) as FidelityFixtureManifestEntry[
    'mutations'
  ];
}

function fixture(
  overrides: Partial<
    FidelityFixtureManifestEntry
  > = {},
): FidelityFixtureManifestEntry {
  return {
    id: 'complete-fixture',
    title: 'Complete fixture',
    classes: [
      ...PHASE9_REQUIRED_FIXTURE_CLASSES,
    ],
    availability: 'generated',
    provenance: {
      kind:
        'deterministic-generator',
      source:
        'scripts/example-generator',
      licenseOrOwnership:
        'Repository-owned generator.',
      reproducible: true,
    },
    artifactPath:
      'fidelity/generated/example.pdf',
    generatorId:
      'complete-fixture',
    baseline: [{
      structure: 'catalog',
      expected:
        'Declared semantic structure exists.',
    }],
    mutations:
      allMutationExpectations(),
    ...overrides,
  };
}

describe(
  'Phase 9 fidelity corpus manifest validation',
  () => {
    it(
      'accepts a complete reproducible corpus declaration',
      () => {
        const manifest:
          FidelityCorpusManifest = {
            schemaVersion: 1,
            corpusId:
              'phase9-pdf-fidelity',
            fixtures: [fixture()],
          };

        expect(
          validateFidelityCorpusManifest(
            manifest,
          ),
        ).toEqual({
          valid: true,
          complete: true,
          diagnostics: [],
          pendingFixtureIds: [],
          missingRequiredClasses: [],
        });
      },
    );

    it(
      'keeps pending source obligations visible without misclassifying schema validity',
      () => {
        const manifest:
          FidelityCorpusManifest = {
            schemaVersion: 1,
            corpusId:
              'phase9-pdf-fidelity',
            fixtures: [
              fixture({
                availability:
                  'required-pending',
                provenance: {
                  kind:
                    'required-source-pending',
                  source:
                    'Legally redistributable signed source required.',
                  licenseOrOwnership:
                    'Provenance must be recorded.',
                  reproducible: false,
                },
                artifactPath: null,
                generatorId: null,
              }),
            ],
          };

        const result =
          validateFidelityCorpusManifest(
            manifest,
          );

        expect(result.valid)
          .toBe(true);
        expect(result.complete)
          .toBe(false);
        expect(
          result.pendingFixtureIds,
        ).toEqual([
          'complete-fixture',
        ]);
      },
    );

    it(
      'rejects missing class coverage and incomplete mutation expectations',
      () => {
        const mutations =
          allMutationExpectations();
        const {
          rotate: _rotate,
          ...withoutRotate
        } = mutations;

        const manifest =
          {
            schemaVersion: 1,
            corpusId:
              'phase9-pdf-fidelity',
            fixtures: [
              fixture({
                classes: [
                  'ordinary-native-text',
                ],
                mutations:
                  withoutRotate,
              }),
            ],
          } as unknown as
            FidelityCorpusManifest;

        const result =
          validateFidelityCorpusManifest(
            manifest,
          );

        expect(result.valid)
          .toBe(false);
        expect(
          result.diagnostics.some(
            (diagnostic) =>
              diagnostic.code
              === 'MISSING_REQUIRED_CLASS',
          ),
        ).toBe(true);
        expect(
          result.diagnostics,
        ).toContainEqual(
          expect.objectContaining({
            code:
              'MISSING_MUTATION_EXPECTATION',
            fixtureId:
              'complete-fixture',
          }),
        );
      },
    );
  },
);
