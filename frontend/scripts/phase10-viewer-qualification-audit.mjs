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
const returnedReviewValidatorPath = path.join(
  frontendRoot,
  'scripts/phase10-validate-returned-review.mjs',
);
const returnedReviewProbePath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/viewerReturnedReviewProbe.test.ts',
);
const returnedRichTextValidatorPath = path.join(
  frontendRoot,
  'scripts/phase10-validate-returned-rich-text.mjs',
);
const returnedRichTextProbePath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/viewerReturnedRichTextProbe.test.ts',
);
const packagePath = path.join(frontendRoot, 'package.json');
const docsPath = path.resolve(frontendRoot, '..', 'Docs/PHASE10_VIEWER_QUALIFICATION.md');

const requiredPaths = [
  qualificationPath,
  annotationManifestPath,
  typesPath,
  corpusTestPath,
  writerPath,
  validatorPath,
  returnedReviewValidatorPath,
  returnedReviewProbePath,
  returnedRichTextValidatorPath,
  returnedRichTextProbePath,
  packagePath,
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
const returnedReviewValidatorContent = fs.readFileSync(returnedReviewValidatorPath, 'utf8');
const returnedReviewProbeContent = fs.readFileSync(returnedReviewProbePath, 'utf8');
const returnedRichTextValidatorContent = fs.readFileSync(
  returnedRichTextValidatorPath,
  'utf8',
);
const returnedRichTextProbeContent = fs.readFileSync(
  returnedRichTextProbePath,
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
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

if (qualification.schema_version !== 'phase10-viewer-qualification-v2') {
  errors.push('viewer qualification manifest must use phase10-viewer-qualification-v2');
}

const journeyIds = Object.keys(
  qualification.interoperability_journeys ?? {},
);
if (
  JSON.stringify(journeyIds)
  !== JSON.stringify(['review-round-trip', 'rich-text-preservation'])
) {
  errors.push('viewer qualification manifest must declare exactly the review-round-trip and rich-text-preservation interoperability journeys');
}

if (qualification.production_writer?.export !== 'writeNativePdfAnnotations') {
  errors.push('qualification corpus must identify writeNativePdfAnnotations as production writer');
}

if (qualification.baseline?.require_absent_ap !== true) {
  errors.push('qualification baseline must require absent /AP before production /AP work begins');
}

const apActivation = qualification.ap_activation_contract;
if (!apActivation
  || apActivation.policy !== 'EVIDENCE_GATED_BY_NAMED_VIEWER_RENDER_FAILURE'
  || apActivation.baseline !== 'NO_PRODUCTION_AP'
  || apActivation.authorized_trigger !== 'render=FAIL'
  || !Array.isArray(apActivation.unauthorized_states)
  || !apActivation.unauthorized_states.includes('render=PASS')
  || !apActivation.unauthorized_states.includes('render=NOT_RUN')
  || !Array.isArray(apActivation.required_evidence)
  || !apActivation.required_evidence.includes('viewer.version')
  || !apActivation.required_evidence.includes('viewer.platform')
  || !apActivation.required_evidence.includes('exact_product_material_sha')
  || !apActivation.scope_rule?.includes('only the failing annotation type/family')
  || !apActivation.requalification_rule?.includes('do not carry forward prior PASS evidence')) {
  errors.push('viewer qualification manifest must make /AP activation render-FAIL-only, evidence-bound, family-scoped, and subject to requalification');
}

for (const token of [
  'writeNativePdfAnnotations',
  "PDFName.of('AP')",
  'PHASE10_VIEWER_CORPUS_DIR',
  'phase10-validate-viewer-evidence.mjs',
  'rich-text-preservation',
  'readNativePdfAnnotations',
  "PDFName.of('RC')",
  "PDFName.of('DS')",
]) {
  if (!corpusTest.includes(token)) {
    errors.push(`corpus test missing required production/evidence token: ${token}`);
  }
}

for (const token of [
  'NOT QUALIFIED',
  'QUALIFIED CAPABILITY PROFILE',
  'native_interaction',
  'edit_save_reopen',
  'external_mutation',
  'return_semantics',
  'UNSUPPORTED',
  'journey_observations',
  'evidence_ref',
  "observation.render !== 'PASS'",
  'interoperability_journeys',
]) {
  if (!validatorContent.includes(token)) {
    errors.push(`viewer evidence validator missing capability/fail-closed token: ${token}`);
  }
}

if (validatorContent.includes('reopen_editability')) {
  errors.push('viewer evidence validator must not retain the v1 reopen_editability contract');
}

for (const token of [
  'viewerReturnedReviewProbe.test.ts',
  'PHASE10_RETURNED_REVIEW_PDF',
  'PHASE10_RETURN_REPORT_PATH',
  'RETURN SEMANTICS QUALIFIED',
]) {
  if (!returnedReviewValidatorContent.includes(token)) {
    errors.push(`returned-review validator missing required token: ${token}`);
  }
}

for (const token of [
  'readNativePdfAnnotations',
  'writeNativePdfAnnotations',
  'phase10-review-return-evidence-v1',
  'semanticSnapshot',
  'externalDelta',
  'external_delta',
  'parentReplyId',
  'replyTopology',
  'rootPassive',
  'hasAppearance',
  'rawGraphSummary',
]) {
  if (!returnedReviewProbeContent.includes(token)) {
    errors.push(`returned-review probe missing production/evidence token: ${token}`);
  }
}

if (
  packageJson.scripts?.['validate:phase10-returned-review']
  !== 'node scripts/phase10-validate-returned-review.mjs'
) {
  errors.push('package.json must expose validate:phase10-returned-review');
}

for (const token of [
  'viewerReturnedRichTextProbe.test.ts',
  'PHASE10_RETURNED_RICH_TEXT_PDF',
  'PHASE10_RICH_TEXT_RETURN_REPORT_PATH',
  'RICH-TEXT RETURN SEMANTICS QUALIFIED',
]) {
  if (!returnedRichTextValidatorContent.includes(token)) {
    errors.push(`returned-rich-text validator missing required token: ${token}`);
  }
}

for (const token of [
  'readNativePdfAnnotations',
  'writeNativePdfAnnotations',
  'phase10-rich-text-return-evidence-v1',
  'NATIVE_PRESERVED_READ_ONLY',
  'externalDelta',
  "'Contents'",
  "'RC'",
  "'DS'",
  'hasAppearance',
]) {
  if (!returnedRichTextProbeContent.includes(token)) {
    errors.push(`returned-rich-text probe missing production/evidence token: ${token}`);
  }
}

if (
  packageJson.scripts?.['validate:phase10-returned-rich-text']
  !== 'node scripts/phase10-validate-returned-rich-text.mjs'
) {
  errors.push('package.json must expose validate:phase10-returned-rich-text');
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
  'review-round-trip',
  'render=PASS',
  'native_interaction',
  'edit_save_reopen',
  'external_mutation',
  'UNSUPPORTED',
  'return_semantics',
  'validate:phase10-returned-review',
  'RETURN SEMANTICS QUALIFIED',
  'rich-text-preservation',
  'validate:phase10-returned-rich-text',
  'RICH-TEXT RETURN SEMANTICS QUALIFIED',
  'NATIVE_PRESERVED_READ_ONLY',
  'No compatibility claim',
  'pnpm run validate:phase10-viewer-evidence C:\\path\\to\\viewer-evidence.json',
]) {
  if (!docsContent.includes(token)) {
    errors.push(`qualification runbook missing required operator contract: ${token}`);
  }
}

if (docsContent.includes('pnpm run validate:phase10-viewer-evidence -- ')) {
  errors.push('qualification runbook must not pass a literal -- before the evidence path under pnpm 10');
}

if (errors.length > 0) {
  console.error('Phase 10 viewer qualification audit FAILED');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log('=== Phase 10 Viewer Qualification Audit ===');
console.log('[PASS] Canonical 17-type corpus coverage is exact.');
console.log('[PASS] Appearance-family mapping covers every supported type exactly once.');
console.log('[PASS] Review and rich-text interoperability journeys are mandatory and generated through the production reader/writer path.');
console.log('[PASS] Corpus is bound to the production native annotation writer.');
console.log('[PASS] Current qualification baseline requires no managed /AP and only named-viewer render FAIL can activate bounded AP work.');
console.log('[PASS] External-viewer evidence validator is fail-closed and capability-scoped.');
console.log('[PASS] Returned review and rich-text probes replay external output through the production reader/writer and emit durable evidence.');
console.log('[PASS] Production native annotation writer contains no /AP implementation token.');
console.log('[PASS] Operator runbook preserves evidence-before-implementation boundary.');
console.log('=== Phase 10 Viewer Qualification Audit PASSED ===');
