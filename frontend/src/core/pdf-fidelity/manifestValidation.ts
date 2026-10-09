import {
  PHASE9_MUTATION_CLASSES,
  PHASE9_REQUIRED_FIXTURE_CLASSES,
  PHASE9_STRUCTURE_KINDS,
  type FidelityCorpusManifest,
  type FidelityFixtureClass,
  type FidelityManifestDiagnostic,
  type FidelityManifestValidation,
} from './types';

const REQUIRED_CLASS_SET =
  new Set<string>(
    PHASE9_REQUIRED_FIXTURE_CLASSES,
  );
const STRUCTURE_KIND_SET =
  new Set<string>(
    PHASE9_STRUCTURE_KINDS,
  );

export function validateFidelityCorpusManifest(
  manifest: FidelityCorpusManifest,
): FidelityManifestValidation {
  const diagnostics:
    FidelityManifestDiagnostic[] = [];
  const ids = new Set<string>();
  const covered =
    new Set<FidelityFixtureClass>();
  const pendingFixtureIds: string[] = [];

  if (
    manifest.schemaVersion !== 1
    || manifest.corpusId
      !== 'phase9-pdf-fidelity'
    || !Array.isArray(manifest.fixtures)
  ) {
    diagnostics.push({
      code: 'INVALID_MANIFEST',
      message:
        'Phase 9 fidelity manifest header is invalid.',
    });
  }

  for (const fixture of manifest.fixtures) {
    if (!fixture.id.trim()) {
      diagnostics.push({
        code: 'INVALID_MANIFEST',
        message:
          'Fixture id must be non-empty.',
      });
      continue;
    }
    if (ids.has(fixture.id)) {
      diagnostics.push({
        code: 'DUPLICATE_FIXTURE_ID',
        fixtureId: fixture.id,
        message:
          `Duplicate fixture id ${fixture.id}.`,
      });
    }
    ids.add(fixture.id);

    if (
      fixture.availability
        === 'required-pending'
    ) {
      pendingFixtureIds.push(
        fixture.id,
      );
    }

    for (
      const fixtureClass
      of fixture.classes
    ) {
      if (
        !REQUIRED_CLASS_SET.has(
          fixtureClass,
        )
      ) {
        diagnostics.push({
          code: 'UNKNOWN_CLASS',
          fixtureId: fixture.id,
          fixtureClass,
          message:
            `Fixture ${fixture.id} declares unknown class ${fixtureClass}.`,
        });
        continue;
      }
      covered.add(fixtureClass);
    }

    if (
      fixture.structures.length === 0
      || fixture.structures.some(
        (structure) =>
          !STRUCTURE_KIND_SET.has(
            structure,
          ),
      )
    ) {
      diagnostics.push({
        code: 'INVALID_MANIFEST',
        fixtureId: fixture.id,
        message:
          `Fixture ${fixture.id} must declare at least one known semantic structure key.`,
      });
    }

    const declaredStructures =
      new Set(fixture.structures);
    if (
      fixture.baseline.some(
        (expectation) =>
          !declaredStructures.has(
            expectation.structure,
          ),
      )
    ) {
      diagnostics.push({
        code: 'INVALID_MANIFEST',
        fixtureId: fixture.id,
        message:
          `Fixture ${fixture.id} baseline references a semantic structure outside its declared structure set.`,
      });
    }

    if (
      !fixture.provenance.source.trim()
      || !fixture.provenance
        .licenseOrOwnership.trim()
    ) {
      diagnostics.push({
        code: 'MISSING_PROVENANCE',
        fixtureId: fixture.id,
        message:
          `Fixture ${fixture.id} requires source and ownership/license provenance.`,
      });
    }

    if (
      fixture.availability === 'generated'
      && (
        fixture.provenance.kind
          !== 'deterministic-generator'
        || !fixture.generatorId
        || !fixture.artifactPath
        || !fixture.provenance.reproducible
      )
    ) {
      diagnostics.push({
        code: 'INVALID_AVAILABILITY',
        fixtureId: fixture.id,
        message:
          `Generated fixture ${fixture.id} requires a reproducible deterministic generator and artifact path.`,
      });
    }

    if (
      fixture.availability
        === 'required-pending'
      && fixture.provenance.kind
        !== 'required-source-pending'
    ) {
      diagnostics.push({
        code: 'INVALID_AVAILABILITY',
        fixtureId: fixture.id,
        message:
          `Pending fixture ${fixture.id} must declare required-source-pending provenance.`,
      });
    }

    if (fixture.availability === 'retained') {
      if (
        fixture.provenance.kind
          !== 'redistributable-retained'
        || !fixture.provenance.reproducible
        || !fixture.artifactPath
      ) {
        diagnostics.push({
          code: 'INVALID_AVAILABILITY',
          fixtureId: fixture.id,
          message:
            `Retained fixture ${fixture.id} requires reproducible redistributable-retained provenance and an artifact path.`,
        });
      }

      if (
        !fixture.integrity
        || !/^[0-9a-f]{40}$/i.test(
          fixture.integrity.gitBlobSha1,
        )
        || !Number.isInteger(
          fixture.integrity.byteLength,
        )
        || fixture.integrity.byteLength <= 0
      ) {
        diagnostics.push({
          code: 'MISSING_INTEGRITY',
          fixtureId: fixture.id,
          message:
            `Retained fixture ${fixture.id} requires a 40-hex Git blob SHA-1 and positive byte length.`,
        });
      }
    }

    if (fixture.baseline.length === 0) {
      diagnostics.push({
        code:
          'MISSING_BASELINE_EXPECTATION',
        fixtureId: fixture.id,
        message:
          `Fixture ${fixture.id} has no baseline semantic expectation.`,
      });
    }

    for (
      const mutation
      of PHASE9_MUTATION_CLASSES
    ) {
      const expectation =
        fixture.mutations[mutation];
      if (
        !expectation
        || !expectation.rationale.trim()
        || expectation
          .expectedStructures.length
          === 0
        || expectation
          .expectedStructures.some(
            (structure) =>
              !declaredStructures.has(
                structure.structure,
              ),
          )
      ) {
        diagnostics.push({
          code:
            'MISSING_MUTATION_EXPECTATION',
          fixtureId: fixture.id,
          message:
            `Fixture ${fixture.id} has no complete expectation for ${mutation}.`,
        });
      }
    }
  }

  const missingRequiredClasses =
    PHASE9_REQUIRED_FIXTURE_CLASSES
      .filter(
        (fixtureClass) =>
          !covered.has(fixtureClass),
      );

  for (
    const fixtureClass
    of missingRequiredClasses
  ) {
    diagnostics.push({
      code: 'MISSING_REQUIRED_CLASS',
      fixtureClass,
      message:
        `Required Phase 9 fixture class ${fixtureClass} is not declared.`,
    });
  }

  return {
    valid:
      diagnostics.length === 0,
    complete:
      diagnostics.length === 0
      && pendingFixtureIds.length === 0,
    diagnostics,
    pendingFixtureIds:
      [...pendingFixtureIds].sort(),
    missingRequiredClasses: [
      ...missingRequiredClasses,
    ],
  };
}
