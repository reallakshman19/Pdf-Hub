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

const provenanceTypes = requireFile('src/core/existing-text/provenanceTypes.ts');
const scanner = requireFile('src/core/existing-text/contentStreamScanner.ts');
const clearanceScanner = requireFile('src/core/existing-text/visualClearanceScanner.ts');
const validation = requireFile('src/core/existing-text/commandValidation.ts');
const commandTypes = requireFile('src/core/commands/types.ts');
const fit = requireFile('src/adapters/pdf-text/PdfLibExistingTextFit.ts');
const fitTypes = requireFile('src/core/existing-text/fitTypes.ts');
const replacement = requireFile('src/adapters/pdf-text/PdfLibExistingTextReplacement.ts');
const replacementTests = requireFile('src/adapters/pdf-text/PdfLibExistingTextReplacement.test.ts');
const pkg = requireFile('package.json');

requireTokens(
  'provenance discriminated union spacing and compound show types',
  provenanceTypes,
  [
    'charSpacingPt: number;',
    'wordSpacingPt: number;',
    'ExistingTextSingleQuoteOperator',
    "operator: \"'\"",
    'ExistingTextDoubleQuoteOperator',
    'operator: \'"\'',
    'ExistingTextSimpleTextOperator =',
    '| ExistingTextSingleQuoteOperator',
    '| ExistingTextDoubleQuoteOperator',
  ],
);

requireTokens(
  'scanner graphics state persistent spacing and stack tracking',
  scanner,
  [
    'charSpacingPt: number;',
    'wordSpacingPt: number;',
    'charSpacingSafe: boolean;',
    'wordSpacingSafe: boolean;',
    'charSpacingPt: 0,',
    'wordSpacingPt: 0,',
    'charSpacingSafe: true,',
    'wordSpacingSafe: true,',
    'graphicsStack.push(',
    'graphicsStack.pop()',
    "case 'q':",
    "case 'Q':",
  ],
);

requireTokens(
  'scanner Tc and Tw operators and spacing survival across BT/ET',
  scanner,
  [
    "case 'Tc': {",
    "case 'Tw': {",
    'applySimpleTc(',
    'applySimpleTw(',
    'graphics.charSpacingPt =',
    'graphics.wordSpacingPt =',
    'graphics.charSpacingSafe =',
    'graphics.wordSpacingSafe =',
  ],
);

requireTokens(
  'scanner single-quote and double-quote operators',
  scanner,
  [
    "case \"'\": {",
    'case \'"\': {',
    'buildSimpleQuoteCandidate(',
    'buildDoubleQuoteCandidate(',
    "operator: \"'\",",
    'operator: \'"\',',
    'applyLineTranslation(',
    '-text.textLeadingPt',
  ],
);

requireTokens(
  'scanner strict bounds: unsupported horizontal scaling and rise invalidate style',
  scanner,
  [
    "case 'Tz':",
    "case 'Ts':",
    'text.styleSafe =\n            false;',
  ],
);

requireTokens(
  'scanner strict bounds: complex TJ arrays rejected',
  scanner,
  [
    'buildSingleStringTjCandidate(',
    'operands.length !== 3',
  ],
);

requireTokens(
  'command validation admits Tc, Tw, and quote operators safely',
  validation,
  [
    "provenance.operator !== 'Tj'",
    "provenance.operator !== 'TJ'",
    'provenance.operator !== "\'"',
    'provenance.operator !== \'"\'',
    'provenance.charSpacingPt,',
    'payload.provenance.charSpacingPt',
    'provenance.wordSpacingPt,',
    'payload.provenance.wordSpacingPt',
    'provenance.operandRange.end as number) >',
    'provenance.operatorRange.start as number)',
  ],
);

forbidTokens(
  'no separate operator-specific commands (sole mutation is REPLACE_EXISTING_TEXT)',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT_TC'",
    "'REPLACE_EXISTING_TEXT_TW'",
    "'REPLACE_EXISTING_TEXT_QUOTE'",
    "'REPLACE_EXISTING_TEXT_SINGLE_QUOTE'",
    "'REPLACE_EXISTING_TEXT_DOUBLE_QUOTE'",
    "'REPLACE_TC_EXISTING_TEXT'",
    "'REPLACE_TW_EXISTING_TEXT'",
  ],
);

requireTokens(
  'fit engine accounts for charSpacingPt and wordSpacingPt',
  fit,
  [
    'wordSpacingPt?: number;',
    'charSpacingPt?: number;',
    'countAsciiSpaces(input.sourceText) * wordSpacingPt',
    'countAsciiSpaces(input.replacementText) * wordSpacingPt',
    'input.sourceText.length * charSpacingPt',
    'input.replacementText.length * charSpacingPt',
  ],
);

requireTokens(
  'fit types declare spacing fields',
  fitTypes,
  [
    'charSpacingPt?: number;',
    'wordSpacingPt?: number;',
  ],
);

requireTokens(
  'replacement engine validates spacing drift and only mutates operandRange bytes',
  replacement,
  [
    'charSpacingPt:\n          input.provenance.charSpacingPt',
    'wordSpacingPt:\n          input.provenance.wordSpacingPt',
    'current.charSpacingPt,\n      expected.charSpacingPt',
    'current.wordSpacingPt,\n      expected.wordSpacingPt',
    'replaceByteRange(',
    'input.provenance\n        .operandRange.start',
    'input.provenance\n        .operandRange.end',
  ],
);

requireTokens(
  'visual clearance rejects extra text-show operators without widening',
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
  'replacement tests cover Tc, Tw, single-quote, double-quote, q/Q stack, and drift',
  replacementTests,
  [
    'replaces text positioned with explicit Tc and Tw and survives save/reopen',
    'replaces single-string TJ positioned with explicit Tc and Tw and survives save/reopen',
    'replaces text using single-quote operator',
    'replaces text using double-quote operator',
    'supports Tc and Tw set outside BT and preserved across text objects',
    'tracks Tc and Tw across q/Q graphics state stack',
    'rejects provenance drift if Tc in content stream is altered before mutation',
    'rejects provenance drift if Tw in content stream is altered before mutation',
    'rejects provenance drift if single-quote operator',
    'rejects provenance drift if double-quote operator parameters are altered before mutation',
  ],
);

requireTokens(
  'package scripts',
  pkg,
  [
    '"audit:phase13-existing-text-native-spacing-compound-shows"',
    '"test:phase13-existing-text-native-spacing-compound-shows"',
    '"certify:phase13-existing-text-native-spacing-compound-shows"',
  ],
);

if (failures.length > 0) {
  console.error('=== Phase 13 Native Spacing & Compound Shows Audit FAILED ===');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('=== Phase 13 Native Spacing & Compound Shows Audit PASSED ===');
console.log(`${passes.length} check(s) passed.`);
