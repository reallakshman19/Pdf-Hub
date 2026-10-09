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
const expectedReaderFields = ['Contents', 'Rect', 'C', 'IC', 'CL', 'L', 'Vertices', 'InkList', 'State'];
if (JSON.stringify(precedence?.reader_enforced_fields) !== JSON.stringify(expectedReaderFields)) {
  errors.push('External-edit precedence must declare the exact production-reader enforced field set');
}
if (JSON.stringify(precedence?.pending_fields) !== JSON.stringify(['DA', 'QuadPoints'])) {
  errors.push('DA and QuadPoints must remain explicit pending reader limitations in STEP-10-01');
}

const reviewFixture = manifest.review_thread_fixture;
if (!reviewFixture
  || reviewFixture.root?.nm !== 'phase10-review-root-1'
  || reviewFixture.reply?.relationship !== 'IRT_OBJECT_REFERENCE'
  || reviewFixture.repeated_save?.cycles !== 2
  || reviewFixture.repeated_save?.duplicates_allowed !== false) {
  errors.push('Manifest must declare deterministic root/reply /NM + /IRT repeated-save fixture semantics');
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
console.log('[PASS] External-edit precedence surface and pending fields are explicit.');
console.log('[PASS] Deterministic root/reply /NM + /IRT repeated-save fixture contract verified.');
console.log('[PASS] Save/Export separation and signed rewrite policies verified.');
console.log('[PASS] Signed-PDF structural detector and Save warning surface verified.');
console.log('=== Phase 10 Audit PASSED ===');
