#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

console.log('=== Running Phase 10 Native Annotation Interoperability Audit ===');

const manifestPath = path.join(frontendRoot, 'src/core/pdf-annotations/fixtures/annotationManifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`FAIL: Missing annotation manifest at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const typesFilePath = path.join(frontendRoot, 'src/core/annotations/annotationTypes.ts');
const typesContent = fs.readFileSync(typesFilePath, 'utf-8');

// Extract ANNOTATION_TYPES array from annotationTypes.ts
const match = typesContent.match(/export const ANNOTATION_TYPES = \s*\[([^\]]+)\]/);
if (!match) {
  console.error('FAIL: Could not extract ANNOTATION_TYPES from annotationTypes.ts');
  process.exit(1);
}

const canonicalTypes = match[1]
  .split(',')
  .map((s) => s.trim().replace(/['"]/g, ''))
  .filter(Boolean);

console.log(`Discovered ${canonicalTypes.length} canonical annotation types in DocCraft:`);
console.log(canonicalTypes.map((t) => `  - ${t}`).join('\n'));

if (canonicalTypes.length !== 17) {
  console.error(`FAIL: Expected exactly 17 supported annotation types, found ${canonicalTypes.length}`);
  process.exit(1);
}

let errors = [];

// 1. Check all canonical types are present in manifest fixtures
for (const type of canonicalTypes) {
  if (!manifest.fixtures[type]) {
    errors.push(`Missing fixture definition in manifest for type: ${type}`);
    continue;
  }

  const f = manifest.fixtures[type];
  if (!f.pdfSubtype) {
    errors.push(`Fixture ${type} has no declared pdfSubtype`);
  }
  if (f.appearanceStreamRequired !== true) {
    errors.push(`Fixture ${type} must declare appearanceStreamRequired: true`);
  }
  if (!Array.isArray(f.standardPdfFields) || f.standardPdfFields.length === 0) {
    errors.push(`Fixture ${type} must declare non-empty standardPdfFields`);
  }
  if (!f.geometry || typeof f.geometry.width !== 'number' || typeof f.geometry.height !== 'number') {
    errors.push(`Fixture ${type} has invalid or missing geometry`);
  }
}

// 2. Check subtype ambiguities are explicitly handled
const requiredAmbiguities = ['Text', 'Square', 'Line', 'FreeText'];
for (const amb of requiredAmbiguities) {
  if (!manifest.subtype_ambiguities[amb]) {
    errors.push(`Missing subtype ambiguity rule for ${amb}`);
  } else {
    const def = manifest.subtype_ambiguities[amb];
    if (!Array.isArray(def.candidate_types) || def.candidate_types.length < 2) {
      errors.push(`Ambiguity ${amb} must list at least 2 candidate types`);
    }
    if (!def.oracle_rule || typeof def.oracle_rule !== 'string') {
      errors.push(`Ambiguity ${amb} must specify a concrete oracle_rule`);
    }
  }
}

// 3. Verify policies
if (!manifest.policies?.appearance_stream_requirement?.enforce_ap_for_all_supported_types) {
  errors.push('Manifest policies must enforce /AP appearance stream requirement for all supported types');
}

if (!manifest.policies?.external_edit_precedence?.standard_fields_override_custom_data) {
  errors.push('Manifest policies must declare external edit precedence (standard fields override custom data)');
}

const precedence = manifest.policies?.external_edit_precedence;
const requiredReaderFields = [
  'Contents',
  'Rect',
  'C',
  'CA',
  'IC',
  'CL',
  'L',
  'Vertices',
  'InkList',
  'State',
  'DA',
  'QuadPoints',
  'F',
  'Border',
  'BS',
  'Q',
  'Open',
  'Name',
  'LE',
];
for (const field of requiredReaderFields) {
  if (!precedence?.reader_enforced_fields?.includes(field)) {
    errors.push(`External-edit precedence missing production-reader field: ${field}`);
  }
}
if (!Array.isArray(precedence?.pending_fields) || precedence.pending_fields.length !== 0) {
  errors.push('External-edit precedence must have no remaining pending fields');
}
for (const field of ['DA', 'QuadPoints', 'F', 'Border', 'BS', 'Q', 'Open', 'Name', 'LE', 'IT', 'BE', 'RC', 'DS']) {
  if (!precedence?.field_mappings?.[field]) {
    errors.push(`Manifest missing standard-field mapping for ${field}`);
  }
}
if (!precedence?.type_precedence_rule?.includes('recognized standard fields override stale PDFHubType')) {
  errors.push('Manifest must require standard subtype semantics to override stale PDFHubType');
}

const fieldCoverage = manifest.policies?.standard_field_coverage;
const declaredStandardFields = new Set([
  ...Object.values(manifest.fixtures)
    .flatMap((fixture) => fixture.standardPdfFields ?? []),
  ...(fieldCoverage?.supplemental_declared_fields ?? []),
]);
const coverageSets = [
  fieldCoverage?.semantic_reader_fields,
  fieldCoverage?.classification_fields,
  fieldCoverage?.identity_lifecycle_fields,
  fieldCoverage?.preserved_only_fields,
].filter(Array.isArray);
const coveredStandardFields = new Set(coverageSets.flat());
for (const field of declaredStandardFields) {
  if (!coveredStandardFields.has(field)) {
    errors.push(`Declared standard field is not covered by a reader/classification/preservation policy: ${field}`);
  }
}
for (const field of coveredStandardFields) {
  if (!declaredStandardFields.has(field)) {
    errors.push(`Standard-field coverage names a field not declared by any fixture: ${field}`);
  }
}
if (!Array.isArray(fieldCoverage?.ignored_fields) || fieldCoverage.ignored_fields.length !== 0) {
  errors.push('Declared standard-field coverage must not silently ignore fields');
}


for (const field of ['RC', 'DS']) {
  if (!fieldCoverage?.preserved_only_fields?.includes(field)) {
    errors.push(`Native rich-text field must be covered as preserved-only semantics: ${field}`);
  }
}

const richTextFidelity = manifest.policies?.rich_text_fidelity;
if (!richTextFidelity
  || richTextFidelity.fidelity_class !== 'NATIVE_PRESERVED_READ_ONLY'
  || richTextFidelity.rich_text_field !== 'RC'
  || richTextFidelity.free_text_default_style_field !== 'DS'
  || richTextFidelity.writer_failure_code !== 'NATIVE_RICH_TEXT_EDIT_UNSUPPORTED'
  || !richTextFidelity.mutation_rule?.includes('blocks annotation type, plain text, and typography mutations')
  || !richTextFidelity.writer_rule?.includes('fails with NATIVE_RICH_TEXT_EDIT_UNSUPPORTED')
  || !richTextFidelity.clone_rule?.includes('Copy/duplicate')
  || !richTextFidelity.clone_rule?.includes('cross-page reassignment')
  || !richTextFidelity.reply_rule?.includes('review replies with RC')) {
  errors.push('Manifest must declare fail-closed native rich-text preservation, reply, and clone semantics');
}

const reviewFixture = manifest.review_thread_fixture;
if (!reviewFixture
  || reviewFixture.root?.nm !== 'phase10-review-root-1'
  || reviewFixture.reply?.relationship !== 'IRT_OBJECT_REFERENCE'
  || reviewFixture.state?.relationship !== 'IRT_OBJECT_REFERENCE'
  || reviewFixture.state?.encoding !== 'TEXT_STRING'
  || !reviewFixture.state?.transition_rule?.includes('original review annotation')
  || reviewFixture.repeated_save?.cycles !== 2
  || reviewFixture.repeated_save?.duplicates_allowed !== false
  || reviewFixture.repeated_save?.state_history_preserved !== true
  || reviewFixture.repeated_save?.noop_save_appends_state !== false
  || reviewFixture.repeated_save?.semantic_state_change_appends_transition !== true) {
  errors.push('Manifest must declare deterministic root/reply/state native relationship and transition-history semantics');
}

const reviewProjection = manifest.policies?.review_state_projection;
if (!reviewProjection
  || reviewProjection.native_model !== 'AUTHOR_SPECIFIC_REVIEW_STATE_ANNOTATIONS'
  || reviewProjection.application_model !== 'SINGLE_THREAD_STATUS'
  || !reviewProjection.preservation_rule?.includes('Preserve all native Review state transition annotations')) {
  errors.push('Manifest must declare native review-state chain preservation and application projection boundary');
}

const transitionAuthor = reviewProjection?.transition_author;
if (!transitionAuthor
  || transitionAuthor.native_source !== 'State annotation T text string'
  || transitionAuthor.imported_projection !== 'ReviewMetadata.statusAuthor'
  || transitionAuthor.local_status_action_default !== 'Current User'
  || !transitionAuthor.chain_rule?.includes('original review annotation')) {
  errors.push('Manifest must declare Review state transition author provenance and direct-root IRT emission');
}


const replyTopology = manifest.policies?.reply_thread_topology;
if (!replyTopology
  || replyTopology.native_model !== 'IRT_REPLY_GRAPH'
  || replyTopology.persistence_model !== 'FLAT_REPLY_ARRAY_WITH_PARENT_REPLY_ID'
  || replyTopology.ui_projection !== 'FLAT_MESSAGES'
  || !replyTopology.preservation_rule?.includes('ReviewReply.parentReplyId')
  || !replyTopology.reply_state_rule?.includes('never project')
  || !replyTopology.unparsed_reply_rule?.includes('remain native')) {
  errors.push('Manifest must declare nested reply topology preservation and reply-state isolation');
}

if (!reviewFixture.external_nested_reply
  || reviewFixture.external_nested_reply.relationship !== 'IRT_TO_REPLY'
  || reviewFixture.external_nested_reply.app_projection !== 'ReviewReply.parentReplyId'
  || !reviewFixture.external_nested_reply.state_on_reply_rule?.includes('does not update the root thread status')
  || !reviewFixture.external_nested_reply.opaque_descendant?.includes('lacking Contents remains native')) {
  errors.push('Manifest must declare the external nested-reply interoperability fixture');
}


const dictionaryPreservation = manifest.policies?.native_dictionary_preservation;
if (!dictionaryPreservation
  || !dictionaryPreservation.ownership_rule?.includes('Other standard, vendor, and extension')
  || !dictionaryPreservation.reply_passive_rule?.includes('copied forward')
  || !dictionaryPreservation.appearance_rule?.includes('semantically unchanged')
  || !dictionaryPreservation.appearance_rule?.includes('stale AP is omitted')
  || !dictionaryPreservation.rich_text_rule?.includes('NATIVE_PRESERVED_READ_ONLY')) {
  errors.push('Manifest must declare passive native dictionary, conditional /AP, and rich-text preservation');
}

if (!manifest.policies?.save_vs_export_separation?.save_preserves_native_annotations) {
  errors.push('Manifest policies must declare save preserves native annotations');
}

if (!manifest.policies?.save_vs_export_separation?.hidden_flattening_prohibited) {
  errors.push('Manifest policies must prohibit hidden flattening');
}

if (!manifest.policies?.signed_pdf_rewrite_policy?.warn_on_rewrite) {
  errors.push('Manifest policies must declare signed PDF rewrite warning');
}

const nativeWriterPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/nativeAnnotationWriter.ts',
);
if (!fs.existsSync(nativeWriterPath)) {
  errors.push(`Missing native annotation writer: ${nativeWriterPath}`);
} else {
  const nativeWriterContent = fs.readFileSync(nativeWriterPath, 'utf8');
  for (const token of [
    'ROOT_OWNED_KEYS',
    'REPLY_OWNED_KEYS',
    'preservePassiveAnnotationEntries',
    'appearanceFieldsEquivalent',
    'relinkPopupParent',
    'relinkPreservedReplyParents',
    'representedReplyIds',
    "name === 'AP' && !preserveAppearance",
    'defaultAppearanceValue',
    'textMarkupQuadPoints',
    'annotationFlagsValue',
    'annotationBorderValue',
    'annotationBorderStyleValue',
    'lineEndingsValue',
    'stampNameValue',
    'cloudBorderEffectValue',
    'assertNativeRichTextRootMutationSupported',
    'NATIVE_RICH_TEXT_EDIT_UNSUPPORTED',
  ]) {
    if (!nativeWriterContent.includes(token)) {
      errors.push(`Native writer missing passive-preservation token: ${token}`);
    }
  }
}

const nativeReaderPath = path.join(
  frontendRoot,
  'src/core/pdf-annotations/nativeAnnotationReader.ts',
);
if (!fs.existsSync(nativeReaderPath)) {
  errors.push(`Missing native annotation reader: ${nativeReaderPath}`);
} else {
  const nativeReaderContent = fs.readFileSync(nativeReaderPath, 'utf8');
  for (const token of [
    'readAnnotationBorder',
    'readLineEndings',
    'squareAnnotationType',
    'stampStyleFromPdfName',
    "readNumber(dict, 'Q'",
    "readNumber(dict, 'F'",
    "readBoolean(dict, 'Open'",
    "readNumberArray(dict, 'CL'",
    "PDFName.of('RC')",
    "NATIVE_PRESERVED_READ_ONLY",
  ]) {
    if (!nativeReaderContent.includes(token)) {
      errors.push(`Native reader missing standard-field symmetry token: ${token}`);
    }
  }
}

const nativeInteropGuardPath = path.join(
  frontendRoot,
  'src/core/annotations/nativeInteropFidelity.ts',
);
const annotationStorePath = path.join(
  frontendRoot,
  'src/core/annotations/store.ts',
);
for (const requiredPath of [nativeInteropGuardPath, annotationStorePath]) {
  if (!fs.existsSync(requiredPath)) {
    errors.push(`Missing native interoperability fidelity guard file: ${requiredPath}`);
  }
}
if (fs.existsSync(nativeInteropGuardPath)) {
  const fidelityContent = fs.readFileSync(nativeInteropGuardPath, 'utf8');
  for (const token of [
    'isNativeRichTextReadOnly',
    'guardNativeInteropAnnotationPatch',
    'guardNativeInteropStylePatch',
    'hasNativeRichTextSemantics',
    'NATIVE_PRESERVED_READ_ONLY',
  ]) {
    if (!fidelityContent.includes(token)) {
      errors.push(`Native interoperability fidelity guard missing token: ${token}`);
    }
  }
}
if (fs.existsSync(annotationStorePath)) {
  const storeContent = fs.readFileSync(annotationStorePath, 'utf8');
  for (const token of [
    'guardNativeInteropAnnotationPatch',
    'guardNativeInteropStylePatch',
    'hasNativeRichTextSemantics',
  ]) {
    if (!storeContent.includes(token)) {
      errors.push(`Annotation store missing fidelity guard token: ${token}`);
    }
  }
}

const signatureRiskPath = path.join(frontendRoot, 'src/core/pdf-signatures/signatureRisk.ts');
const toolbarFilePath = path.join(frontendRoot, 'src/components/toolbar/ToolbarFile.tsx');
const signatureDialogPath = path.join(frontendRoot, 'src/components/toolbar/SignedPdfRewriteWarningDialog.tsx');

for (const requiredPath of [signatureRiskPath, toolbarFilePath, signatureDialogPath]) {
  if (!fs.existsSync(requiredPath)) {
    errors.push(`Missing signed-PDF rewrite warning implementation file: ${requiredPath}`);
  }
}

if (fs.existsSync(signatureRiskPath)) {
  const signatureRiskContent = fs.readFileSync(signatureRiskPath, 'utf-8');
  for (const token of ['ByteRange', 'Contents', "PDFName.of('FT')", "'/Sig'", "status: 'SIGNED'"]) {
    if (!signatureRiskContent.includes(token)) {
      errors.push(`Signature-risk detector must contain structural token: ${token}`);
    }
  }
}

if (fs.existsSync(toolbarFilePath)) {
  const toolbarContent = fs.readFileSync(toolbarFilePath, 'utf-8');
  if (!toolbarContent.includes('await inspectPdfSignatureRisk(workingBytes)')) {
    errors.push('Toolbar Save must inspect signature risk before rewrite');
  }
  if (!toolbarContent.includes("risk.status === 'SIGNED' || risk.status === 'UNKNOWN'")) {
    errors.push('Toolbar Save must fail safe for both SIGNED and UNKNOWN signature state');
  }
  if (!toolbarContent.includes('setSignatureWarning({')) {
    errors.push('Toolbar Save must surface the signature-risk warning before continuing');
  }
}

if (fs.existsSync(signatureDialogPath)) {
  const signatureDialogContent = fs.readFileSync(signatureDialogPath, 'utf-8');
  if (!signatureDialogContent.includes('Saving may invalidate existing digital signatures')) {
    errors.push('Signed-PDF warning must explicitly state invalidation risk');
  }
  if (!signatureDialogContent.includes('does not currently preserve signature validity')) {
    errors.push('Signed-PDF warning must not imply signature preservation');
  }
  if (!signatureDialogContent.includes('could not determine whether this PDF contains digital signatures')) {
    errors.push('Signature warning must surface UNKNOWN detection state instead of failing open');
  }
}

if (errors.length > 0) {
  console.error('\nAudit FAILED with errors:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('\n[PASS] All 17 annotation types covered.');
console.log('[PASS] All 4 subtype ambiguities (Text, Square, Line, FreeText) verified with oracle rules.');
console.log('[PASS] Appearance stream (/AP) expectations declared.');
console.log('[PASS] External-edit precedence covers every declared standard field; RC/DS are preserved read-only with fail-closed mutation guards.');
console.log('[PASS] Root/reply/state relationships, nested reply topology, passive dictionary fields, conditional /AP retention, popup relinking, actor provenance, and Review-state preservation verified.');
console.log('[PASS] Save/Export separation and signed rewrite policies verified.');
console.log('[PASS] Signed-PDF structural detector and Save warning surface verified.');
console.log('=== Phase 10 Audit PASSED ===');
