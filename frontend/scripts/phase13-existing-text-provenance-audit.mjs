#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function requireFile(relativePath) {
  const fullPath =
    path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(
      `missing file: ${relativePath}`,
    );
    return '';
  }
  passes.push(
    `file: ${relativePath}`,
  );
  return read(relativePath);
}

function requireTokens(
  label,
  text,
  tokens,
) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      failures.push(
        `${label}: missing token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: ${token}`,
      );
    }
  }
}

function forbidTokens(
  label,
  text,
  tokens,
) {
  for (const token of tokens) {
    if (text.includes(token)) {
      failures.push(
        `${label}: forbidden token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: no ${token}`,
      );
    }
  }
}

const reader = requireFile(
  'src/adapters/pdf-text/PdfLibExistingTextContentStreams.ts',
);
const scanner = requireFile(
  'src/core/existing-text/contentStreamScanner.ts',
);
const matcher = requireFile(
  'src/core/existing-text/provenanceMatcher.ts',
);
const types = requireFile(
  'src/core/existing-text/provenanceTypes.ts',
);
const scannerTests = requireFile(
  'src/core/existing-text/__tests__/contentStreamScanner.test.ts',
);
const matcherTests = requireFile(
  'src/core/existing-text/__tests__/provenanceMatcher.test.ts',
);
const adapterTests = requireFile(
  'src/adapters/pdf-text/PdfLibExistingTextContentStreams.test.ts',
);
const commands = requireFile(
  'src/core/commands/types.ts',
);
const mutationTypes = requireFile(
  'src/core/pdf-mutation/types.ts',
);
const mutationEngine = requireFile(
  'src/adapters/pdf-mutation/PdfLibMutationEngine.ts',
);
const docs = requireFile(
  '../Docs/EXISTING_PDF_TEXT_EDITING.md',
);

requireTokens(
  'decoded stream reader',
  reader,
  [
    'normalizedEntries()',
    'entries.Contents',
    'decodePDFRawStream',
    'NON_RAW_CONTENT_STREAM',
    'CONTENT_STREAM_DECODE_FAILED',
    'complete:',
  ],
);

forbidTokens(
  'reader is read-only',
  reader,
  [
    '.save(',
    '.set(',
    'addContentStream',
    'drawText(',
  ],
);

requireTokens(
  'simple scanner',
  scanner,
  [
    "case 'Tf'",
    "case 'Tm'",
    "case 'Tj'",
    "case 'TJ'",
    "case 'cm'",
    "'ascii-literal'",
    "'ascii-hex'",
    'operandRange',
    'operatorRange',
    'placementSafe',
    'styleSafe',
  ],
);

requireTokens(
  'provenance contract',
  types + matcher,
  [
    'streamIndex',
    'streamRef',
    'fontResourceName',
    'fontSizePt',
    'textMatrix',
    'INCOMPLETE_CONTENT_STREAM_SET',
    'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
    'SPAN_OUTSIDE_SIMPLE_TEXT_SUBSET',
    'candidateMatchesSpan',
  ],
);

requireTokens(
  'focused tests',
  scannerTests
    + matcherTests
    + adapterTests,
  [
    'simple literal-string Tj',
    'ASCII hex-string Tj',
    'non-ASCII encoded strings',
    'rejects ambiguous matches across streams',
    'generated simple page stream',
  ],
);

forbidTokens(
  'no canonical replacement command',
  commands,
  [
    'REPLACE_EXISTING_TEXT',
    'EDIT_EXISTING_TEXT',
  ],
);

forbidTokens(
  'no mutation contract',
  mutationTypes
    + mutationEngine,
  [
    'replaceExistingText',
    'editExistingText',
    'rewriteTextOperator',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Content-stream provenance',
    'simple `Tj`',
    'exactly one',
    'read-only',
    'ASCII-safe',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Provenance Audit FAILED ===',
  );
  failures.forEach(
    (failure) =>
      console.error(
        `[FAIL] ${failure}`,
      ),
  );
  console.error(
    `${passes.length} check(s) passed before failure.`,
  );
  process.exit(1);
}

console.log(
  '=== Phase 13 Existing Text Provenance Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
