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

const types = requireFile(
  'src/core/existing-text/types.ts',
);
const model = requireFile(
  'src/core/existing-text/model.ts',
);
const tests = requireFile(
  'src/core/existing-text/__tests__/model.test.ts',
);
const renderer = requireFile(
  'src/adapters/pdf-renderer/PdfRendererAdapter.ts',
);
const rendererTests = requireFile(
  'src/adapters/pdf-renderer/PdfRendererAdapter.test.ts',
);
const commands = requireFile(
  'src/core/commands/types.ts',
);
const mutations = requireFile(
  'src/core/pdf-mutation/types.ts',
);
const docs = requireFile(
  '../Docs/EXISTING_PDF_TEXT_EDITING.md',
);

requireTokens(
  'source contract',
  types,
  [
    'ExistingTextSourceItem',
    'ExistingTextTransform',
    'sourceIndex: number',
    'fontName?: string',
    'direction?: string',
    'hasEol: boolean',
  ],
);

requireTokens(
  'identity contract',
  model,
  [
    'context.revisionId',
    'context.pageId',
    'item.sourceIndex',
    "encodeURIComponent(",
    "'existing-text'",
  ],
);

requireTokens(
  'classification contract',
  model,
  [
    "'native-replacement-candidate'",
    "'reconstructed-candidate'",
    "'unsupported'",
    "'MISSING_FONT_IDENTITY'",
    "'VERTICAL_WRITING_MODE'",
    "'ROTATED_TEXT'",
    "'SKEWED_TEXT'",
    "'NON_FINITE_GEOMETRY'",
  ],
);

requireTokens(
  'edit intent contract',
  model,
  [
    'createExistingTextEditIntent',
    'sourceRevisionId',
    'expectedText',
    'validateExistingTextEditIntentAgainstSpan',
  ],
);

requireTokens(
  'renderer extraction',
  renderer,
  [
    'getPageExistingTextSourceItems',
    'page.getTextContent()',
    'record.fontName',
    'record.dir',
    'record.hasEOL',
  ],
);

requireTokens(
  'focused tests',
  tests + rendererTests,
  [
    'binds span identity to revision + PageId + source index rather than physical page index',
    'fails closed for blank or malformed source geometry',
    'detects stale selections',
    'preserves scale-independent PDF.js source text metadata for existing-text inspection',
  ],
);

forbidTokens(
  'no premature canonical command',
  commands,
  [
    'REPLACE_EXISTING_TEXT',
    'EDIT_EXISTING_TEXT',
  ],
);

forbidTokens(
  'no premature mutation method',
  mutations,
  [
    'replaceExistingText',
    'editExistingText',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    'native-replacement-candidate',
    'reconstructed-candidate',
    'unsupported',
    'revision-bound',
    'does not mean mutation-ready',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Audit FAILED ===',
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
  '=== Phase 13 Existing Text Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
