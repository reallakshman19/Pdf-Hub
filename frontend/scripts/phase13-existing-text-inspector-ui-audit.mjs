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

const editorTypes =
  requireFile(
    'src/core/editor/types.ts',
  );
const inspector =
  requireFile(
    'src/components/inspector/InspectorPanel.tsx',
  );
const textTab =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.tsx',
  );
const evaluation =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextUiEvaluation.ts',
  );
const evaluationTests =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextUiEvaluation.test.ts',
  );
const tabTests =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.test.tsx',
  );
const inspectorTests =
  requireFile(
    'src/components/inspector/InspectorPanel.existingText.test.tsx',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'Inspector tab registration',
  editorTypes + inspector,
  [
    "'text'",
    "id: 'text'",
    "label: 'PDF text'",
    'ExistingTextInspectorTab',
    "inspectorTab === 'text'",
    "inspectorTab !== 'text'",
  ],
);

requireTokens(
  'UI capability composition',
  evaluation,
  [
    'assertPrintableAsciiReplacement',
    'createExistingTextEditIntent',
    'readExistingTextPageContentStreams',
    'matchExistingTextSpanToContentStream',
    'analyzeExistingTextVisualClearance',
    "status: 'native'",
    "'fallback-proved'",
    "status: 'unavailable'",
  ],
);

requireTokens(
  'current-page identity inspection',
  textTab,
  [
    'buildExistingTextPageInspection',
    'pageNode.pageId',
    'revisionId:',
    'documentKey',
    'viewState.currentPage',
    'getPageExistingTextSourceItems',
  ],
);

requireTokens(
  'native command execution',
  textTab,
  [
    "'REPLACE_EXISTING_TEXT'",
    'commandBus.execute({',
    'materializePdfCommand(',
    "'toolbar'",
    'capability.provenance',
    'capability.intent',
    'Text replacement failed',
    'Existing text replaced',
  ],
);

forbidTokens(
  'Inspector does not bypass canonical analysis',
  textTab,
  [
    'measureExistingTextNativeFit',
    'scanExistingTextVisualClearancePaint',
    'analyzeExistingTextVisualClearance',
    'replaceSimpleExistingTextTj',
    'PdfMutationSession',
    'commitDocumentMutation',
  ],
);

requireTokens(
  'fallback reconstruction stays separately gated',
  textTab,
  [
    'Replacement is too wide; fallback evidence is proved',
    "'RECONSTRUCT_EXISTING_TEXT'",
    'existing-text-reconstruct-btn',
    "capability?.status",
    "'fallback-proved'",
    'does not rewrite',
  ],
);
forbidTokens(
  'Inspector still does not mutate directly',
  textTab,
  [
    'RECONSTRUCTED_OVERLAY',
    'MASK_AND_REDRAW_EXISTING_TEXT',
    'applyReconstructedExistingText',
    'drawVisualMasks',
    'reconstructExistingText(',
  ],
);

requireTokens(
  'focused adapter proofs',
  evaluationTests,
  [
    'reports native capability from the canonical fit analysis',
    'reports proved fallback without converting it into native authority',
    'rejects non-ASCII replacement before content/provenance analysis',
    'reports unavailable when exact current provenance cannot be rematched',
  ],
);

requireTokens(
  'focused Inspector proofs',
  tabTests + inspectorTests,
  [
    'inspects the active page using the stable PageId and shows source classification',
    'enables canonical native replacement only after capability proof',
    'exposes proved fallback through the distinct reconstructed command without cached evidence',
    'surfaces canonical command failure without claiming success',
    'opens PDF text without requiring annotation selection',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Minimal Inspector UI',
    'native replacement available',
    'fallback evidence proved',
    'editing unavailable',
    'Apply reconstructed replacement',
    'Direct on-page selection',
    'revision + PageId + PDF.js source index',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Inspector UI Audit FAILED ===',
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
  '=== Phase 13 Existing Text Inspector UI Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
