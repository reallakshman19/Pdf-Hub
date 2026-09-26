#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing file: ${relativePath}`);
    return '';
  }
  passes.push(`file: ${relativePath}`);
  return read(relativePath);
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      failures.push(`${label}: missing token ${JSON.stringify(token)}`);
    } else {
      passes.push(`${label}: ${token}`);
    }
  }
}

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) {
      failures.push(`${label}: forbidden token ${JSON.stringify(token)}`);
    } else {
      passes.push(`${label}: no ${token}`);
    }
  }
}

const scanner = requireFile('src/core/existing-text/contentStreamScanner.ts');
const clearanceScanner = requireFile('src/core/existing-text/visualClearanceScanner.ts');
const commandTypes = requireFile('src/core/commands/types.ts');
const replacement = requireFile('src/adapters/pdf-text/PdfLibExistingTextReplacement.ts');
const pkg = requireFile('package.json');

requireTokens(
  'scanner TL and T* operator handling',
  scanner,
  [
    "case 'TL': {",
    "case 'T*': {",
    'applySimpleTl',
    'applySimpleTStar',
    'applyLineTranslation',
    'textLeadingPt:',
    'text.textLeadingPt =',
    'operands.length !== 1',
    'operands.length !== 0',
    'text.textLeadingPt === null',
    '-text.textLeadingPt',
  ],
);

requireTokens(
  'scanner quote operators remain strictly unsupported',
  scanner,
  [
    "case \"'\":",
    "case '\"':",
    'text.placementSafe =\n            false;',
    'text.textLineMatrix =\n            null;',
    'text.textLeadingPt =\n            null;',
  ],
);

forbidTokens(
  'scanner does not admit quote operators as valid text shows',
  scanner,
  [
    'buildSimpleQuoteCandidate',
    'buildQuoteCandidate',
    'case "\'": {\n          applyQuote',
    'case "\'":\n          applyQuote',
  ],
);

requireTokens(
  'scanner text shows leave textLineMatrix and textLeadingPt intact',
  scanner,
  [
    "case 'Tj': {",
    "case 'TJ': {",
    'text.placementSafe =\n            false;',
  ],
);

requireTokens(
  'visual clearance rejects TJ, single-quote, and double-quote as unsupported extra show',
  clearanceScanner,
  [
    "case 'TJ':",
    "case \"'\":",
    "case '\"':",
    "'EXTRA_TEXT_SHOW'",
    'Unsupported additional text-show operator',
  ],
);

requireTokens(
  'replacement writer preserves prefix and suffix bytes',
  replacement,
  [
    'prefixBytesPreserved:',
    'suffixBytesPreserved:',
    'replaceByteRange(',
    'operandRange.start',
    'operandRange.end',
  ],
);

forbidTokens(
  'no separate TL, T*, or leading advance command or payload',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT_TL'",
    "'REPLACE_EXISTING_TEXT_TSTAR'",
    "'REPLACE_EXISTING_TEXT_LEADING_ADVANCE'",
    "'REPLACE_TL_EXISTING_TEXT'",
    "'REPLACE_TSTAR_EXISTING_TEXT'",
    "'REPLACE_EXISTING_TEXT_QUOTE'",
  ],
);

requireTokens(
  'package scripts',
  pkg,
  [
    '"audit:phase13-existing-text-native-leading-advance"',
    '"test:phase13-existing-text-native-leading-advance"',
    '"certify:phase13-existing-text-native-leading-advance"',
  ],
);

if (failures.length > 0) {
  console.error('=== Phase 13 Native Leading Advance Audit FAILED ===');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('=== Phase 13 Native Leading Advance Audit PASSED ===');
console.log(`${passes.length} check(s) passed.`);
