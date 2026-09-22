#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

const qualificationPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/fixtures/viewerQualificationManifest.json',
);
const annotationManifestPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/fixtures/annotationManifest.json',
);
const typesPath = path.join(frontendRoot, 'src/core/annotations/annotationTypes.ts');
const corpusTestPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/viewerQualificationCorpus.test.ts',
);
const writerPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/nativeAnnotationWriter.ts',
);
const validatorPath = path.join(
  frontendRoot,
  'scripts/phase10-validate-viewer-evidence.mjs',
);
const docsPath = path.resolve(frontendRoot, '..', 'Docs/PHASE10_VIEWER_QUALIFICATION.md');

const requiredPaths = [
  qualificationPath,
  annotationManifestPath,
  typesPath,
  corpusTestPath,
  writerPath,
  validatorPath,
  docsPath,
];

const errors = [];
for (const requiredPath of requiredPaths) {
  if (!fs.existsSync(requiredPath)) {
    errors.push(`missing qualification artifact: ${requiredPath}`);
  }
}

if (errors.length > 0) {
  console.error('Phase 10 viewer qualification audit FAILED');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const qualification = JSON.parse(fs.readFileSync(qualificationPath, 'utf8'));
const annotationManifest = JSON.parse(fs.readFileSync(annotationManifestPath, 'utf8'));
const typesContent = fs.readFileSync(typesPath, 'utf8');
const corpusTest = fs.readFileSync(corpusTestPath, 'utf8');
const writerContent = fs.readFileSync(writerPath, 'utf8');
const validatorContent = fs.readFileSync(validatorPath, 'utf8');
const docsContent = fs.readFileSync(docsPath, 'utf8');

const typeMatch = typesContent.match(/export const ANNOTATION_TYPES = \s*\[([^\]]+)\]/);
if (!typeMatch) {
  errors.push('could not extract canonical ANNOTATION_TYPES');
}

const canonicalTypes = typeMatch
  ? typeMatch[1]
      .split(',')
      .map((value) => value.trim().replace(/['"]/g, ''))
      .filter(Boolean)
  : [];

if (canonicalTypes.length !== 17) {
  errors.push(`expected 17 canonical annotation types, found ${canonicalTypes.length}`);
}

if (
  JSON.stringify(qualification.supported_annotation_types)
  !== JSON.stringify(canonicalTypes)
) {
  errors.push('viewer qualification type list must exactly match canonical annotation type order');
}

if (
  JSON.stringify(annotationManifest.supported_annotation_types)
  !== JSON.stringify(canonicalTypes)
) {
  errors.push('existing annotation manifest type list must exactly match canonical annotation type order');
}

const mappedTypes = Object.values(qualification.appearance_families ?? {})
  .flatMap((family) => family.types ?? []);

if (mappedTypes.length !== canonicalTypes.length) {
  errors.push('appearance families must map exactly 17 entries');
}

if (new Set(mappedTypes).size !== canonicalTypes.length) {
  errors.push('appearance family mapping contains duplicate annotation types');
}

for (const type of canonicalTypes) {
  if (!mappedTypes.includes(type)) {
    errors.push(`appearance family mapping missing ${type}`);
  }

  if (annotationManifest.fixtures?.[type]?.appearanceStreamRequired !== true) {
    errors.push(`source annotation manifest must retain appearanceStreamRequired=true for ${type}`);
  }
}

if (qualification.production_writer?.export !== 'writeNativePdfAnnotations') {
  errors.push('qualification corpus must identify writeNativePdfAnnotations as production writer');
}

if (qualification.baseline?.require_absent_ap !== true) {
  errors.push('qualification baseline must require absent /AP before production /AP work begins');
}

for (const token of [
  'writeNativePdfAnnotations',
  "PDFName.of('AP')",
  'PHASE10_VIEWER_CORPUS_DIR',
  'phase10-validate-viewer-evidence.mjs',
]) {
  if (!corpusTest.includes(token)) {
    errors.push(`corpus test missing required production/evidence token: ${token}`);
  }
}

for (const token of [
  'NOT QUALIFIED',
  'render',
  'reopen_editability',
  'evidence_ref',
  "observation.render !== 'PASS'",
  "observation.reopen_editability !== 'PASS'",
]) {
  if (!validatorContent.includes(token)) {
    errors.push(`viewer evidence validator missing fail-closed token: ${token}`);
  }
}

for (const forbidden of [
  "PDFName.of('AP')",
  'target.AP',
  'base.AP',
]) {
  if (writerContent.includes(forbidden)) {
    errors.push(`production native writer unexpectedly contains /AP implementation token: ${forbidden}`);
  }
}

for (const token of [
  'PHASE10_VIEWER_CORPUS_DIR',
  'render=PASS',
  'reopen_editability=PASS',
  'No compatibility claim',
]) {
  if (!docsContent.includes(token)) {
    errors.push(`qualification runbook missing required operator contract: ${token}`);
  }
}

if (errors.length > 0) {
  console.error('Phase 10 viewer qualification audit FAILED');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log('=== Phase 10 Viewer Qualification Audit ===');
console.log('[PASS] Canonical 17-type corpus coverage is exact.');
console.log('[PASS] Appearance-family mapping covers every supported type exactly once.');
console.log('[PASS] Corpus is bound to the production native annotation writer.');
console.log('[PASS] Current qualification baseline requires managed annotations to have no /AP.');
console.log('[PASS] External-viewer evidence validator is fail-closed.');
console.log('[PASS] Production native annotation writer contains no /AP implementation token.');
console.log('[PASS] Operator runbook preserves evidence-before-implementation boundary.');
console.log('=== Phase 10 Viewer Qualification Audit PASSED ===');
