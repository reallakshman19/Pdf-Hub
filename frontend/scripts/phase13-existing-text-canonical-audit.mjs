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

function walkFiles(relativeDir) {
  const absolute =
    path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return fs.readdirSync(
    absolute,
    { withFileTypes: true },
  ).flatMap((entry) => {
    const child =
      path.join(
        relativeDir,
        entry.name,
      );
    return entry.isDirectory()
      ? walkFiles(child)
      : [child];
  });
}

const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const validation =
  requireFile(
    'src/core/existing-text/commandValidation.ts',
  );
const mutationTypes =
  requireFile(
    'src/core/pdf-mutation/types.ts',
  );
const mutationEngine =
  requireFile(
    'src/adapters/pdf-mutation/PdfLibMutationEngine.ts',
  );
const dispatch =
  requireFile(
    'src/core/commands/dispatch.ts',
  );
const replay =
  requireFile(
    'src/core/document-history/replayability.ts',
  );
const sdkTypes =
  requireFile(
    'src/core/sdk/types.ts',
  );
const sdk =
  requireFile(
    'src/core/sdk/publicSdk.ts',
  );
const dispatchTests =
  requireFile(
    'src/core/commands/__tests__/dispatch.test.ts',
  );
const mutationTests =
  requireFile(
    'src/adapters/pdf-mutation/PdfLibMutationEngine.test.ts',
  );
const replayTests =
  requireFile(
    'src/core/document-history/__tests__/replayability.test.ts',
  );
const sdkTests =
  requireFile(
    'src/core/sdk/__tests__/publicSdk.test.ts',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'canonical command',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT'",
    'ReplaceExistingTextCommandPayload',
    'schemaVersion: 1',
    'ExistingTextSpan',
    'ExistingTextEditIntent',
    'ExistingTextSimpleTextOperator',
  ],
);

requireTokens(
  'command validation',
  validation,
  [
    'createExistingTextSpanId',
    'native-replacement-candidate',
    'must match command.documentKey',
    'must match the value derived from payload.span.transform',
    'printable ASCII U+0020..U+007E only',
    'payload.provenance.operator must be Tj',
    'payload.provenance.decodedText must match payload.intent.expectedText',
  ],
);

requireTokens(
  'mutation session',
  mutationTypes + mutationEngine,
  [
    'replaceExistingText',
    'applySimpleExistingTextReplacementToDocument',
    'this.document',
    'this.lib',
  ],
);

requireTokens(
  'canonical dispatcher',
  dispatch,
  [
    "type === 'REPLACE_EXISTING_TEXT'",
    "case 'REPLACE_EXISTING_TEXT': {",
    'page.pageId',
    '.replaceExistingText({',
    'applyCommittedSessionMutation(',
    'invalidatePageIds',
    'ExistingTextReplacementError',
  ],
);

forbidTokens(
  'dispatcher bypass',
  dispatch,
  [
    'replaceSimpleExistingTextTj(',
    'PDFDocument.load(',
  ],
);

requireTokens(
  'history replay',
  replay,
  [
    "case 'REPLACE_EXISTING_TEXT':",
    "'REPLACE_EXISTING_TEXT',",
    'SELF_CONTAINED',
  ],
);

requireTokens(
  'public sdk',
  sdkTypes + sdk,
  [
    "'REPLACE_EXISTING_TEXT'",
    'PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES',
    'commandBus.execute({',
  ],
);

requireTokens(
  'focused tests',
  dispatchTests
    + mutationTests
    + replayTests
    + sdkTests,
  [
    'routes existing-text replacement through the mutation session and canonical history',
    'rejects existing-text PageId drift before mutation-session write',
    'maps bounded existing-text writer failures to validation failure without commit',
    'replaces bounded existing text inside the active parse and commits once',
    "REPLACE_EXISTING_TEXT: 'SELF_CONTAINED_REPLAY'",
    'keeps existing-text replacement self-contained across journal JSON serialization',
    'routes bounded existing-text replacement through CommandBus with API source',
    'rejects spoofed existing-text derived geometry before CommandBus execution',
    'rejects malformed existing-text replacement before CommandBus execution',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Canonical command and history integration',
    'SELF_CONTAINED_REPLAY',
    'PdfMutationSession.replaceExistingText',
    'OCR state anchored to the edited PageId is invalidated',
    'Still not exposed in UI',
  ],
);

const componentSources =
  walkFiles('src/components')
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file)
        && !file.includes('ExistingTextInspectorTab'),
    )
    .map(read)
    .join('\n');
forbidTokens(
  'no end-user UI command exposure',
  componentSources,
  [
    'REPLACE_EXISTING_TEXT',
    'replaceExistingText(',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Canonical Audit FAILED ===',
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
  '=== Phase 13 Existing Text Canonical Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
