import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
  {
    id: 'SAVE_DIRECT_EXPORT_WITHOUT_COMMIT_PIPELINE',
    file: 'src/components/toolbar/ToolbarFile.tsx',
    failIfMatches: [
      /PdfEditAdapter\.exportWithAnnotations\(workingBytes,\s*annotations\)/,
      /\bsetDirty\(false\)/,
    ],
    requiredMatches: [
      /composeCommittedPdf/,
      /commitWorkingCopy/,
      /clearElementsAfterCommit/,
    ],
    message:
      'ToolbarFile must use composeCommittedPdf() + commitWorkingCopy(), not direct exportWithAnnotations() + setDirty(false).',
  },
  {
    id: 'ANNOTATION_PERSISTENCE_MUST_THROW',
    file: 'src/core/annotations/persistence.ts',
    failIfMatches: [
      /catch\s*\([^)]*\)\s*{[\s\S]*return\s+\[\]/,
    ],
    requiredMatches: [
      /AnnotationPersistenceError/,
      /throw new AnnotationPersistenceError/,
    ],
    message:
      'Annotation persistence failures must throw AnnotationPersistenceError and must not silently return [].',
  },
  {
    id: 'OCR_TEXT_MUST_BE_ESCAPED',
    file: 'src/components/writer/WriterOverlay.tsx',
    failIfMatches: [
      /content:\s*`<p>\$\{text\.replace/,
    ],
    requiredMatches: [
      /ocrTextToHtml/,
      /escapeHtml/,
    ],
    message:
      'OCR text must be escaped before insertion into writer HTML.',
  },
  {
    id: 'WRITER_EXPORT_TABLE_CELL_ESCAPE',
    file: 'src/core/writer/exporter.ts',
    failIfMatches: [
      /\$\{cell\.text\}/,
      /container\.innerHTML\s*=\s*element\.content/,
    ],
    requiredMatches: [
      /sanitizeWriterHtml/,
      /escapeHtml/,
      /drawTableElement/,
      /drawRichTextElement/,
    ],
    message:
      'Writer export must sanitize rich HTML and escape table cell text; semantic text/table export should be present.',
  },
  {
    id: 'MACRO_DRY_RUN_MUST_BE_BEHAVIORAL',
    file: 'src/core/macro/validation/validator.ts',
    failIfMatches: [
      /Dry run validation complete/,
    ],
    requiredMatches: [
      /simulateMacroDryRun/,
      /dryRunDiff/,
    ],
    message:
      'Macro dry-run must report behavioral diff, not only validation logs.',
  },
  {
    id: 'MACRO_EXECUTOR_MUST_ROLL_BACK',
    file: 'src/core/macro/executor.ts',
    failIfMatches: [],
    requiredMatches: [
      /beginMacroTransaction/,
      /rollbackMacroTransaction/,
      /applyMacroSideEffects/,
      /rolledBack/,
    ],
    message:
      'Macro executor must run inside a transaction and roll back on aborting error.',
  },
];

let failures = 0;

for (const check of checks) {
  const filePath = path.join(root, check.file);

  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] ${check.id}: missing file ${check.file}`);
    failures += 1;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let checkFailed = false;

  for (const pattern of check.failIfMatches) {
    if (pattern.test(content)) {
      console.error(`[FAIL] ${check.id}: forbidden pattern found in ${check.file}`);
      console.error(`       ${check.message}`);
      failures += 1;
      checkFailed = true;
    }
  }

  for (const pattern of check.requiredMatches) {
    if (!pattern.test(content)) {
      console.error(`[FAIL] ${check.id}: required pattern missing in ${check.file}`);
      console.error(`       Missing: ${pattern}`);
      console.error(`       ${check.message}`);
      failures += 1;
      checkFailed = true;
    }
  }

  if (!checkFailed) {
    console.log(`[PASS] ${check.id}`);
  }
}

if (failures > 0) {
  console.error(`\nPhase 8 static audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nPhase 8 static audit passed.');
