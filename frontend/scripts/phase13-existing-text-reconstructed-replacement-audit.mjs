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

const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const validators =
  requireFile(
    'src/core/commands/validators.ts',
  );
const dispatch =
  requireFile(
    'src/core/commands/dispatch.ts',
  );
const mutationTypes =
  requireFile(
    'src/core/pdf-mutation/types.ts',
  );
const mutationEngine =
  requireFile(
    'src/adapters/pdf-mutation/PdfLibMutationEngine.ts',
  );
const reconstruction =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextReconstruction.ts',
  );
const clearance =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextVisualClearance.ts',
  );
const clearanceTypes =
  requireFile(
    'src/core/existing-text/visualClearanceTypes.ts',
  );
const scanner =
  requireFile(
    'src/core/existing-text/visualClearanceScanner.ts',
  );
const inspector =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.tsx',
  );
const inspectorTests =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.test.tsx',
  );
const clearanceTests =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextVisualClearance.test.ts',
  );
const engineTests =
  requireFile(
    'src/adapters/pdf-mutation/PdfLibMutationEngine.test.ts',
  );
const dispatchTests =
  requireFile(
    'src/core/commands/__tests__/dispatch.test.ts',
  );
const replayability =
  requireFile(
    'src/core/document-history/replayability.ts',
  );
const sdkTypes =
  requireFile(
    'src/core/sdk/types.ts',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'distinct command',
  commandTypes + validators + dispatch,
  [
    "'RECONSTRUCT_EXISTING_TEXT'",
    'ReconstructExistingTextCommand',
    'validateReconstructExistingTextCommandPayload',
    "case 'RECONSTRUCT_EXISTING_TEXT':",
    'mutationSession.reconstructExistingText',
  ],
);

requireTokens(
  'same-document execution proof',
  mutationTypes
    + mutationEngine
    + reconstruction
    + clearance,
  [
    'reconstructExistingText',
    'applyReconstructedExistingTextReplacementToDocument',
    'analyzeExistingTextVisualClearanceInDocument',
    'this.document',
    'RECONSTRUCTED_VISUAL_CLEARANCE_UNPROVED',
    'assertPrintableAsciiReplacement',
  ],
);

forbidTokens(
  'command payload is not cached proof authority',
  commandTypes,
  [
    'ExistingTextReconstructedOverlayEvidence',
    'ExistingTextVisualClearanceProof',
  ],
);

requireTokens(
  'proved rendering inputs',
  clearanceTypes
    + scanner
    + reconstruction,
  [
    'backgroundColorHex',
    'targetTextColorHex',
    "fillColorHex: '#000000'",
    'resolveExistingTextStandard14BaseFont',
    'clearanceRectPt',
    'measuredReplacementWidthPt',
    'Math.max(',
  ],
);

requireTokens(
  'visual-not-native semantics',
  reconstruction + inspector + docs,
  [
    'original text-show',
    'RECONSTRUCT_EXISTING_TEXT',
    'reconstructed',
    'does not rewrite',
  ],
);

requireTokens(
  'ui gating and no cached evidence',
  inspector + inspectorTests,
  [
    "'fallback-proved'",
    'existing-text-reconstruct-btn',
    "'RECONSTRUCT_EXISTING_TEXT'",
    "not.toHaveProperty(",
    "'evidence'",
    "'nativeFit'",
  ],
);

requireTokens(
  'execution regressions',
  clearanceTests
    + engineTests
    + dispatchTests,
  [
    'reconstructs overflow text from same-document proof without reparsing the active revision',
    'rejects non-ASCII reconstructed text at the mutation-session boundary',
    'fails closed when current-session paint changes invalidate reconstructed clearance',
    'keeps the proved clearance at least as wide as the natural redraw when observed metrics scale below one',
    'routes reconstructed existing text through its distinct canonical command',
    'rejects reconstructed existing-text PageId drift before mutation-session write',
    'maps reconstructed proof loss to validation failure without commit',
    'invalidates checked fallback capability when replacement text changes',
    'toHaveBeenCalledTimes(1)',
  ],
);

requireTokens(
  'history replayability',
  replayability,
  [
    "case 'RECONSTRUCT_EXISTING_TEXT'",
    "'RECONSTRUCT_EXISTING_TEXT'",
    "'SELF_CONTAINED_REPLAY'",
  ],
);

forbidTokens(
  'no SDK exposure in this bounded slice',
  sdkTypes,
  [
    "'RECONSTRUCT_EXISTING_TEXT'",
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13.2 Reconstructed Existing Text Audit FAILED ===',
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
  '=== Phase 13.2 Reconstructed Existing Text Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
