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

const scanner =
  requireFile(
    'src/core/existing-text/contentStreamScanner.ts',
  );
const clearanceScanner =
  requireFile(
    'src/core/existing-text/visualClearanceScanner.ts',
  );
const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const replacement =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextReplacement.ts',
  );
const pkg =
  requireFile('package.json');

requireTokens(
  'scanner text state and text-line and leading tracking',
  scanner,
  [
    'textLineMatrix:',
    'textLeadingPt:',
    'ExistingTextTransform | null',
    'textLineMatrix: null',
    'textLeadingPt: null',
    'text.textLineMatrix =',
    'text.textLeadingPt =',
    "case 'Td': {",
    "case 'TD': {",
    'applySimpleTd',
    'operands.length !== 2',
    'text.textLineMatrix = newLineMatrix;',
    'text.textMatrix = newLineMatrix;',
    'text.placementSafe = true;',
    'text.textLeadingPt = -tyToken.numberValue;',
  ],
);

requireTokens(
  'scanner text shows leave textLineMatrix and textLeadingPt intact',
  scanner,
  [
    "case 'Tj': {",
    "case 'TJ': {",
    'text.placementSafe = false;',
  ],
);

requireTokens(
  'unsupported sibling positioning operators invalidate text-line and leading state',
  scanner,
  [
    "case 'T*':",
    "case \"'\":",
    "case '\"':",
    'text.placementSafe = false;',
    'text.textLineMatrix = null;',
    'text.textLeadingPt = null;',
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
  'no separate TD or leading command or payload',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT_TD'",
    "'REPLACE_TD_EXISTING_TEXT'",
    "'REPLACE_EXISTING_TD'",
    "'REPLACE_EXISTING_TEXT_LEADING'",
  ],
);

requireTokens(
  'package scripts',
  pkg,
  [
    '"audit:phase13-existing-text-native-td-leading"',
    '"test:phase13-existing-text-native-td-leading"',
    '"certify:phase13-existing-text-native-td-leading"',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Native TD Leading Audit FAILED ===',
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  '=== Phase 13 Native TD Leading Audit PASSED ===',
);
console.log(`${passes.length} check(s) passed.`);
