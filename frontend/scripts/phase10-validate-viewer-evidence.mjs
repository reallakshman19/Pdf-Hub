#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/fixtures/viewerQualificationManifest.json',
);

const evidencePathArg = process.argv[2];
if (!evidencePathArg) {
  console.error('Usage: node scripts/phase10-validate-viewer-evidence.mjs <evidence.json>');
  process.exit(2);
}

const evidencePath = path.resolve(process.cwd(), evidencePathArg);

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`INVALID EVIDENCE: unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const manifest = loadJson(manifestPath, 'viewer qualification manifest');
const evidence = loadJson(evidencePath, 'viewer evidence');

const errors = [];
const qualificationFailures = [];
const supportedTypes = manifest.supported_annotation_types ?? [];
const allowedResults = new Set(manifest.evidence_contract?.result_values ?? []);

function nonPlaceholderString(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.trim().toUpperCase().startsWith('REPLACE_');
}

if (evidence.schema_version !== 'phase10-viewer-evidence-v1') {
  errors.push('schema_version must be phase10-viewer-evidence-v1');
}

if (
  typeof evidence.corpus_material_head !== 'string'
  || !/^[0-9a-f]{40}$/i.test(evidence.corpus_material_head)
) {
  errors.push('corpus_material_head must be an exact 40-character git SHA');
}

if (!Array.isArray(evidence.viewers) || evidence.viewers.length === 0) {
  errors.push('at least one viewer must be declared');
}

const viewerIds = new Set();
for (const [index, viewer] of (evidence.viewers ?? []).entries()) {
  for (const field of manifest.evidence_contract?.viewer_required_fields ?? []) {
    if (!nonPlaceholderString(viewer?.[field])) {
      errors.push(`viewers[${index}].${field} must be a non-placeholder string`);
    }
  }

  if (nonPlaceholderString(viewer?.id)) {
    if (viewerIds.has(viewer.id)) {
      errors.push(`duplicate viewer id: ${viewer.id}`);
    }
    viewerIds.add(viewer.id);
  }
}

if (!Array.isArray(evidence.observations)) {
  errors.push('observations must be an array');
}

const observationMap = new Map();
for (const [index, observation] of (evidence.observations ?? []).entries()) {
  for (const field of manifest.evidence_contract?.observation_required_fields ?? []) {
    if (!(field in (observation ?? {}))) {
      errors.push(`observations[${index}] missing required field ${field}`);
    }
  }

  if (!viewerIds.has(observation?.viewer_id)) {
    errors.push(`observations[${index}] references unknown viewer_id ${String(observation?.viewer_id)}`);
  }

  if (!supportedTypes.includes(observation?.annotation_type)) {
    errors.push(`observations[${index}] has unsupported annotation_type ${String(observation?.annotation_type)}`);
  }

  if (!allowedResults.has(observation?.render)) {
    errors.push(`observations[${index}].render must be one of ${[...allowedResults].join(', ')}`);
  }

  if (!allowedResults.has(observation?.reopen_editability)) {
    errors.push(`observations[${index}].reopen_editability must be one of ${[...allowedResults].join(', ')}`);
  }

  const key = `${observation?.viewer_id}::${observation?.annotation_type}`;
  if (observationMap.has(key)) {
    errors.push(`duplicate viewer/type observation: ${key}`);
  } else {
    observationMap.set(key, observation);
  }
}

for (const viewer of evidence.viewers ?? []) {
  if (!nonPlaceholderString(viewer?.id)) continue;

  for (const type of supportedTypes) {
    const key = `${viewer.id}::${type}`;
    const observation = observationMap.get(key);

    if (!observation) {
      errors.push(`missing observation for ${key}`);
      continue;
    }

    if (!nonPlaceholderString(observation.evidence_ref)) {
      qualificationFailures.push(`${key}: evidence_ref is missing`);
    }

    if (observation.render !== 'PASS') {
      qualificationFailures.push(`${key}: render=${String(observation.render)}`);
    }

    if (observation.reopen_editability !== 'PASS') {
      qualificationFailures.push(
        `${key}: reopen_editability=${String(observation.reopen_editability)}`,
      );
    }
  }
}

const expectedObservationCount = viewerIds.size * supportedTypes.length;
if (observationMap.size !== expectedObservationCount) {
  errors.push(
    `expected exactly ${expectedObservationCount} unique viewer/type observations, found ${observationMap.size}`,
  );
}

if (errors.length > 0) {
  console.error('INVALID EVIDENCE');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(2);
}

if (qualificationFailures.length > 0) {
  console.error('NOT QUALIFIED');
  for (const failure of qualificationFailures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('QUALIFIED');
console.log(
  `All ${expectedObservationCount} declared viewer/type observations have render=PASS, reopen_editability=PASS, and durable evidence_ref.`,
);
