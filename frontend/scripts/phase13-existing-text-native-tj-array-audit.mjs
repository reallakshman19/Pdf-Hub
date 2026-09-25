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

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) {
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

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) {
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

const provenanceTypes =
  requireFile(
    'src/core/existing-text/provenanceTypes.ts',
  );
const scanner =
  requireFile(
    'src/core/existing-text/contentStreamScanner.ts',
  );
const validation =
  requireFile(
    'src/core/existing-text/commandValidation.ts',
  );
const replacement =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextReplacement.ts',
  );
const clearanceScanner =
  requireFile(
    'src/core/existing-text/visualClearanceScanner.ts',
  );
const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const pkg =
  requireFile('package.json');

requireTokens(
  'provenance discriminated union',
  provenanceTypes,
  [
    'ExistingTextSimpleTextOperatorBase',
    'ExistingTextTjOperator',
    "operator: 'Tj'",
    'ExistingTextSingleStringTjArrayOperator',
    "operator: 'TJ'",
    'arrayRange: {',
    'ExistingTextSimpleTextOperator =',
    'ExistingTextNativeTextOperator =',
  ],
);

requireTokens(
  'scanner single-string TJ bounds',
  scanner,
  [
    "case 'TJ': {",
    'buildSingleStringTjCandidate',
    'operands.length !== 3',
    "openBracket.raw !== '['",
    "closeBracket.raw !== ']'",
    "stringOperand.kind !== 'literal-string'",
    "stringOperand.kind !== 'hex-string'",
    'text.placementSafe =',
    'false',
  ],
);

requireTokens(
  'command validation TJ rules',
  validation,
  [
    "provenance.operator !== 'Tj'",
    "provenance.operator !== 'TJ'",
    "'payload.provenance.operator must be Tj or TJ.'",
    "provenance.operator === 'TJ'",
    'validateRange(',
    'provenance.arrayRange',
    'payload.provenance operand must be enclosed within the TJ arrayRange.',
    'payload.provenance array must end before the TJ operator begins.',
  ],
);

requireTokens(
  'replacement writer operand rewriting & provenance matching',
  replacement,
  [
    "current.operator === 'TJ' && expected.operator === 'TJ'",
    'current.arrayRange.start !== expected.arrayRange.start',
    'current.arrayRange.end !== expected.arrayRange.end',
    'replaceByteRange(',
    'operandRange.start',
    'operandRange.end',
  ],
);

requireTokens(
  'visual clearance rejects TJ as unsupported extra show',
  clearanceScanner,
  [
    "case 'TJ':",
    "case \"'\":",
    "case '\"':",
    "'EXTRA_TEXT_SHOW'",
    'Unsupported additional text-show operator',
  ],
);

forbidTokens(
  'no separate TJ command',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT_TJ'",
    "'REPLACE_TJ_EXISTING_TEXT'",
    "'REPLACE_EXISTING_TJ'",
  ],
);

requireTokens(
  'package scripts',
  pkg,
  [
    '"audit:phase13-existing-text-native-tj-array"',
    '"certify:phase13-existing-text-native-tj-array"',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Native Single-String TJ Array Audit FAILED ===',
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  '=== Phase 13 Native Single-String TJ Array Audit PASSED ===',
);
console.log(`${passes.length} check(s) passed.`);
