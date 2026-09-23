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
const journeyIds = Object.keys(manifest.interoperability_journeys ?? {});
const renderResults = new Set(manifest.evidence_contract?.render_result_values ?? []);
const capabilityResults = new Set(manifest.evidence_contract?.capability_result_values ?? []);

function nonPlaceholderString(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.trim().toUpperCase().startsWith('REPLACE_');
}

function validateRequiredFields(record, fields, prefix) {
  for (const field of fields ?? []) {
    if (!(field in (record ?? {}))) {
      errors.push(`${prefix} missing required field ${field}`);
    }
  }
}

function validateCapabilityResult(value, prefix) {
  if (!capabilityResults.has(value)) {
    errors.push(`${prefix} must be one of ${[...capabilityResults].join(', ')}`);
  }
}

function qualifyCapability(value, prefix) {
  if (value === 'PASS' || value === 'UNSUPPORTED') return;
  qualificationFailures.push(`${prefix}=${String(value)}`);
}

if (manifest.schema_version !== 'phase10-viewer-qualification-v2') {
  errors.push('viewer qualification manifest must be phase10-viewer-qualification-v2');
}

if (evidence.schema_version !== 'phase10-viewer-evidence-v2') {
  errors.push('schema_version must be phase10-viewer-evidence-v2');
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
  validateRequiredFields(
    viewer,
    manifest.evidence_contract?.viewer_required_fields,
    `viewers[${index}]`,
  );

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
  const prefix = `observations[${index}]`;
  validateRequiredFields(
    observation,
    manifest.evidence_contract?.type_observation_required_fields,
    prefix,
  );

  if (!viewerIds.has(observation?.viewer_id)) {
    errors.push(`${prefix} references unknown viewer_id ${String(observation?.viewer_id)}`);
  }

  if (!supportedTypes.includes(observation?.annotation_type)) {
    errors.push(`${prefix} has unsupported annotation_type ${String(observation?.annotation_type)}`);
  }

  if (!renderResults.has(observation?.render)) {
    errors.push(`${prefix}.render must be one of ${[...renderResults].join(', ')}`);
  }

  validateCapabilityResult(observation?.native_interaction, `${prefix}.native_interaction`);
  validateCapabilityResult(observation?.edit_save_reopen, `${prefix}.edit_save_reopen`);

  if (
    observation?.edit_save_reopen === 'PASS'
    && observation?.native_interaction !== 'PASS'
  ) {
    errors.push(`${prefix}: edit_save_reopen=PASS requires native_interaction=PASS`);
  }

  if (
    observation?.native_interaction === 'UNSUPPORTED'
    && observation?.edit_save_reopen !== 'UNSUPPORTED'
  ) {
    errors.push(`${prefix}: native_interaction=UNSUPPORTED requires edit_save_reopen=UNSUPPORTED`);
  }

  const key = `${observation?.viewer_id}::${observation?.annotation_type}`;
  if (observationMap.has(key)) {
    errors.push(`duplicate viewer/type observation: ${key}`);
  } else {
    observationMap.set(key, observation);
  }
}

if (!Array.isArray(evidence.journey_observations)) {
  errors.push('journey_observations must be an array');
}

const journeyObservationMap = new Map();
for (const [index, observation] of (evidence.journey_observations ?? []).entries()) {
  const prefix = `journey_observations[${index}]`;
  validateRequiredFields(
    observation,
    manifest.evidence_contract?.journey_observation_required_fields,
    prefix,
  );

  if (!viewerIds.has(observation?.viewer_id)) {
    errors.push(`${prefix} references unknown viewer_id ${String(observation?.viewer_id)}`);
  }

  if (!journeyIds.includes(observation?.journey_id)) {
    errors.push(`${prefix} has unsupported journey_id ${String(observation?.journey_id)}`);
  }

  if (!renderResults.has(observation?.render)) {
    errors.push(`${prefix}.render must be one of ${[...renderResults].join(', ')}`);
  }

  validateCapabilityResult(observation?.native_interaction, `${prefix}.native_interaction`);
  validateCapabilityResult(observation?.edit_save_reopen, `${prefix}.edit_save_reopen`);
  validateCapabilityResult(observation?.external_mutation, `${prefix}.external_mutation`);
  validateCapabilityResult(observation?.return_semantics, `${prefix}.return_semantics`);

  if (
    observation?.edit_save_reopen === 'PASS'
    && observation?.native_interaction !== 'PASS'
  ) {
    errors.push(`${prefix}: edit_save_reopen=PASS requires native_interaction=PASS`);
  }

  if (
    observation?.edit_save_reopen === 'PASS'
    && observation?.external_mutation !== 'PASS'
  ) {
    errors.push(`${prefix}: edit_save_reopen=PASS requires external_mutation=PASS`);
  }

  if (
    observation?.edit_save_reopen === 'PASS'
    && observation?.return_semantics !== 'PASS'
  ) {
    errors.push(`${prefix}: edit_save_reopen=PASS requires return_semantics=PASS`);
  }

  if (
    observation?.edit_save_reopen === 'UNSUPPORTED'
    && observation?.external_mutation !== 'UNSUPPORTED'
  ) {
    errors.push(`${prefix}: edit_save_reopen=UNSUPPORTED requires external_mutation=UNSUPPORTED`);
  }

  if (
    observation?.edit_save_reopen === 'UNSUPPORTED'
    && observation?.return_semantics !== 'UNSUPPORTED'
  ) {
    errors.push(`${prefix}: edit_save_reopen=UNSUPPORTED requires return_semantics=UNSUPPORTED`);
  }

  if (
    observation?.native_interaction === 'UNSUPPORTED'
    && observation?.edit_save_reopen !== 'UNSUPPORTED'
  ) {
    errors.push(`${prefix}: native_interaction=UNSUPPORTED requires edit_save_reopen=UNSUPPORTED`);
  }

  const key = `${observation?.viewer_id}::${observation?.journey_id}`;
  if (journeyObservationMap.has(key)) {
    errors.push(`duplicate viewer/journey observation: ${key}`);
  } else {
    journeyObservationMap.set(key, observation);
  }
}

let typeRenderPasses = 0;
let typeNativePasses = 0;
let typeNativeUnsupported = 0;
let typeEditPasses = 0;
let typeEditUnsupported = 0;

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
    } else {
      typeRenderPasses += 1;
    }

    qualifyCapability(observation.native_interaction, `${key}: native_interaction`);
    qualifyCapability(observation.edit_save_reopen, `${key}: edit_save_reopen`);

    if (observation.native_interaction === 'PASS') typeNativePasses += 1;
    if (observation.native_interaction === 'UNSUPPORTED') typeNativeUnsupported += 1;
    if (observation.edit_save_reopen === 'PASS') typeEditPasses += 1;
    if (observation.edit_save_reopen === 'UNSUPPORTED') typeEditUnsupported += 1;
  }

  for (const journeyId of journeyIds) {
    const key = `${viewer.id}::${journeyId}`;
    const observation = journeyObservationMap.get(key);

    if (!observation) {
      errors.push(`missing journey observation for ${key}`);
      continue;
    }

    if (!nonPlaceholderString(observation.evidence_ref)) {
      qualificationFailures.push(`${key}: evidence_ref is missing`);
    }

    if (observation.render !== 'PASS') {
      qualificationFailures.push(`${key}: render=${String(observation.render)}`);
    }

    qualifyCapability(observation.native_interaction, `${key}: native_interaction`);
    qualifyCapability(observation.edit_save_reopen, `${key}: edit_save_reopen`);
    qualifyCapability(observation.external_mutation, `${key}: external_mutation`);
    qualifyCapability(observation.return_semantics, `${key}: return_semantics`);
  }
}

const expectedObservationCount = viewerIds.size * supportedTypes.length;
if (observationMap.size !== expectedObservationCount) {
  errors.push(
    `expected exactly ${expectedObservationCount} unique viewer/type observations, found ${observationMap.size}`,
  );
}

const expectedJourneyObservationCount = viewerIds.size * journeyIds.length;
if (journeyObservationMap.size !== expectedJourneyObservationCount) {
  errors.push(
    `expected exactly ${expectedJourneyObservationCount} unique viewer/journey observations, found ${journeyObservationMap.size}`,
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

console.log('QUALIFIED CAPABILITY PROFILE');
console.log(
  `Viewer/type render PASS: ${typeRenderPasses}/${expectedObservationCount}; `
  + `native interaction PASS=${typeNativePasses}, UNSUPPORTED=${typeNativeUnsupported}; `
  + `edit/save/reopen PASS=${typeEditPasses}, UNSUPPORTED=${typeEditUnsupported}.`,
);
console.log(
  `Interoperability journeys qualified: ${expectedJourneyObservationCount}/${expectedJourneyObservationCount}. `
  + 'UNSUPPORTED dimensions are observed capability limits, not compatibility PASS claims.',
);
