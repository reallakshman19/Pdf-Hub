import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath =
  path.join(
    root,
    'fidelity/phase9/manifest.json',
  );
const generatorPath =
  path.join(
    root,
    'scripts/phase9-generate-fidelity-fixtures.mjs',
  );

const manifest =
  JSON.parse(
    fs.readFileSync(
      manifestPath,
      'utf8',
    ),
  );
const generator =
  fs.readFileSync(
    generatorPath,
    'utf8',
  );

const requiredClasses = [
  'ordinary-native-text',
  'scanned-image-only',
  'mixed-geometry-rotation',
  'cropbox-mediabox',
  'nested-outlines',
  'page-labels',
  'acroform-populated',
  'native-annotations',
  'attachments-metadata',
  'tagged-pdf',
  'cid-subset-font',
  'arabic-cjk-rtl',
  'object-stream',
  'incremental-update',
  'encrypted',
  'signed',
  'malformed-readable-xref',
];
const structureKinds = [
  'pages-text',
  'image-only-pages',
  'page-geometry-boxes',
  'outline-tree',
  'page-labels',
  'acroform',
  'native-annotations',
  'embedded-files',
  'metadata',
  'tagged-structure',
  'font-resources',
  'unicode-text',
  'object-streams',
  'incremental-updates',
  'encryption',
  'signatures',
  'xref-readability',
];
const mutationClasses = [
  'rotate',
  'reorder',
  'delete',
  'duplicate',
  'donor-insert',
  'donor-replace',
  'donor-append',
  'save-export',
];

const failures = [];
const fixtureIds = new Set();
const covered = new Set();
const generatedClasses = new Set();
const pending = [];

function fail(message) {
  failures.push(message);
  console.error(
    `[phase9-fidelity-corpus] ${message}`,
  );
}

if (
  manifest.schemaVersion !== 1
  || manifest.corpusId
    !== 'phase9-pdf-fidelity'
  || !Array.isArray(manifest.fixtures)
) {
  fail(
    'manifest header/schema is invalid',
  );
}

for (const fixture of manifest.fixtures) {
  if (
    typeof fixture.id !== 'string'
    || fixture.id.length === 0
  ) {
    fail('fixture id must be non-empty');
    continue;
  }
  if (fixtureIds.has(fixture.id)) {
    fail(
      `duplicate fixture id ${fixture.id}`,
    );
  }
  fixtureIds.add(fixture.id);

  if (
    !Array.isArray(fixture.classes)
    || fixture.classes.length === 0
  ) {
    fail(
      `${fixture.id} has no classes`,
    );
  }
  for (const fixtureClass of fixture.classes ?? []) {
    if (!requiredClasses.includes(fixtureClass)) {
      fail(
        `${fixture.id} has unknown class ${fixtureClass}`,
      );
    }
    covered.add(fixtureClass);
    if (fixture.availability === 'generated') {
      generatedClasses.add(fixtureClass);
    }
  }

  if (
    !Array.isArray(fixture.structures)
    || fixture.structures.length === 0
    || fixture.structures.some(
      (structure) =>
        !structureKinds.includes(
          structure,
        ),
    )
  ) {
    fail(
      `${fixture.id} has invalid semantic structure keys`,
    );
  }
  const fixtureStructures =
    new Set(fixture.structures ?? []);
  if (
    (fixture.baseline ?? []).some(
      (expectation) =>
        !fixtureStructures.has(
          expectation.structure,
        ),
    )
  ) {
    fail(
      `${fixture.id} baseline references undeclared semantic structure`,
    );
  }

  if (
    !fixture.provenance
    || !fixture.provenance.source
    || !fixture.provenance.licenseOrOwnership
  ) {
    fail(
      `${fixture.id} has incomplete provenance`,
    );
  }

  if (
    !Array.isArray(fixture.baseline)
    || fixture.baseline.length === 0
  ) {
    fail(
      `${fixture.id} has no baseline semantic expectations`,
    );
  }

  for (const mutation of mutationClasses) {
    const expectation =
      fixture.mutations?.[mutation];
    if (
      !expectation
      || !expectation.disposition
      || !expectation.rationale
      || !Array.isArray(
        expectation.expectedStructures,
      )
      || expectation
        .expectedStructures.length === 0
      || expectation
        .expectedStructures.some(
          (structure) =>
            !fixtureStructures.has(
              structure.structure,
            ),
        )
    ) {
      fail(
        `${fixture.id} lacks complete ${mutation} expectation`,
      );
    }
  }

  if (fixture.availability === 'generated') {
    if (
      fixture.provenance.kind
        !== 'deterministic-generator'
      || fixture.provenance.reproducible
        !== true
      || !fixture.artifactPath
      || !fixture.generatorId
    ) {
      fail(
        `${fixture.id} generated binding is incomplete`,
      );
    }
    const registryMarker =
      `'${fixture.generatorId}':`;
    if (!generator.includes(registryMarker)) {
      fail(
        `${fixture.id} is generated but missing from generator registry`,
      );
    }
  } else if (
    fixture.availability
      === 'required-pending'
  ) {
    pending.push(fixture.id);
    if (
      fixture.provenance.kind
        !== 'required-source-pending'
      || fixture.artifactPath !== null
      || fixture.generatorId !== null
    ) {
      fail(
        `${fixture.id} pending binding is not explicit/fail-closed`,
      );
    }
  } else if (
    fixture.availability
      === 'retained'
  ) {
    if (
      fixture.provenance.kind
        !== 'redistributable-retained'
      || fixture.provenance.reproducible
        !== true
      || !fixture.artifactPath
    ) {
      fail(
        `${fixture.id} retained fixture provenance is incomplete`,
      );
    }
  } else {
    fail(
      `${fixture.id} has invalid availability ${fixture.availability}`,
    );
  }
}

for (const requiredClass of requiredClasses) {
  if (!covered.has(requiredClass)) {
    fail(
      `missing required class declaration ${requiredClass}`,
    );
  }
}

for (
  const generatedBaseline
  of [
    'ordinary-native-text',
    'scanned-image-only',
    'mixed-geometry-rotation',
    'cropbox-mediabox',
    'nested-outlines',
    'page-labels',
    'acroform-populated',
    'native-annotations',
    'attachments-metadata',
    'object-stream',
  ]
) {
  if (!generatedClasses.has(generatedBaseline)) {
    fail(
      `starter generated corpus lost class ${generatedBaseline}`,
    );
  }
}

if (
  !generator.includes(
    'useObjectStreams: true',
  )
  || !generator.includes(
    "PDFName.of('Outlines')",
  )
  || !generator.includes(
    "PDFName.of('PageLabels')",
  )
  || !generator.includes(
    "form.createTextField(",
  )
  || !generator.includes(
    "await doc.attach(",
  )
  || !generator.includes(
    "PDFName.of('Annots')",
  )
  || !generator.includes(
    'setCropBox(',
  )
  || !generator.includes(
    'embedPng(',
  )
) {
  fail(
    'deterministic generator lost one or more required starter structure constructors',
  );
}

if (failures.length > 0) {
  process.exit(1);
}

console.log(
  `[phase9-fidelity-corpus] manifest authority valid; ${manifest.fixtures.length} entries, ${pending.length} explicit pending source obligations`,
);
