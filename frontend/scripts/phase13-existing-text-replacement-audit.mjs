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

const writer = requireFile(
  'src/adapters/pdf-text/PdfLibExistingTextReplacement.ts',
);
const operand = requireFile(
  'src/core/existing-text/replacementOperand.ts',
);
const tests = requireFile(
  'src/adapters/pdf-text/PdfLibExistingTextReplacement.test.ts',
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
  'write boundary',
  writer,
  [
    'validateExistingTextEditIntentAgainstSpan',
    'currentRevisionId',
    'assertProvenanceStillMatches',
    'SHARED_CONTENT_STREAM_REF',
    'SHARED_CONTENT_CONTAINER_REF',
    'WinAnsiEncoding',
    'LATIN_STANDARD_14',
  ],
);

requireTokens(
  'stream preservation',
  writer,
  [
    'replaceByteRange',
    'copyPassiveStreamEntries',
    "document.context.flateStream(",
    'document.context.assign(',
    'resolvedContents.set(',
    "'Length'",
    "'Filter'",
    "'DecodeParms'",
    'prefixBytesPreserved',
    'suffixBytesPreserved',
  ],
);

requireTokens(
  'operand encoding',
  operand,
  [
    "'ascii-literal'",
    "'ascii-hex'",
    '/^[\\x20-\\x7e]*$/',
    '/[\\\\()]/g',
    '.toUpperCase()',
  ],
);

requireTokens(
  'focused fidelity tests',
  tests,
  [
    'survives save/reopen',
    'escapes parentheses/backslashes',
    'preserves hex representation family',
    'rejects stale revision intent',
    'rejects non-ASCII replacement text',
    'rejects provenance drift',
    'rejects Symbol font resources',
    'rejects non-WinAnsi font encoding',
    'preserves passive target stream dictionary entries',
    'rejects shared indirect content-stream references',
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
  'no mutation-engine integration yet',
  mutationTypes
    + mutationEngine,
  [
    'replaceExistingText',
    'editExistingText',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Bounded native replacement',
    'WinAnsiEncoding',
    'Standard-14',
    'does not reflow',
    'shared content stream',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Replacement Audit FAILED ===',
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
  '=== Phase 13 Existing Text Replacement Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
