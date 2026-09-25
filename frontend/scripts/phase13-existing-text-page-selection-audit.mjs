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

const renderer =
  requireFile(
    'src/adapters/pdf-renderer/PdfRendererAdapter.ts',
  );
const rendererTests =
  requireFile(
    'src/adapters/pdf-renderer/PdfRendererAdapter.test.ts',
  );
const editorTypes =
  requireFile(
    'src/core/editor/types.ts',
  );
const editorStore =
  requireFile(
    'src/core/editor/store.ts',
  );
const workspace =
  requireFile(
    'src/components/workspace/DocumentWorkspace.tsx',
  );
const inspector =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.tsx',
  );
const inspectorTests =
  requireFile(
    'src/components/inspector/ExistingTextInspectorTab.test.tsx',
  );
const mobile =
  requireFile(
    'src/components/shell/MobileShell.tsx',
  );
const mobileTests =
  requireFile(
    'src/components/shell/MobileShell.test.tsx',
  );
const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'rendered source identity',
  renderer + rendererTests,
  [
    'sourceIndex?: number',
    'sourceIndex: index',
    'preserves PDF.js source index gaps when non-text items are skipped',
  ],
);

requireTokens(
  'editor selection contract',
  editorTypes + editorStore,
  [
    'ExistingPdfTextSelection',
    'revisionId: string',
    'pageId: PageId',
    'sourceIndex: number',
    'existingTextSelection',
    'setExistingTextSelection',
  ],
);

requireTokens(
  'page interaction identity',
  workspace,
  [
    'selectedExistingTextSourceIndex',
    'data-existing-text-source-index',
    'data-existing-text-selected',
    'onDoubleClick',
    'setExistingTextSelection({',
    'revisionId:',
    'documentKey',
    'pageId:',
    'pageNode.pageId',
    'sourceIndex',
    "setInspectorTab('text')",
    'rightPanelWidth <= 0.1',
    'setRightPanelWidth(18)',
    'setMobileSheetOpen(true)',
  ],
);

forbidTokens(
  'page interaction does not mutate PDF',
  workspace,
  [
    'commandBus',
    'REPLACE_EXISTING_TEXT',
    'PdfMutationSession',
    'replaceSimpleExistingTextTj',
  ],
);

requireTokens(
  'Inspector synchronization',
  inspector + inspectorTests,
  [
    'existingTextSelection',
    'existingTextSelection.revisionId',
    'existingTextSelection.pageId',
    'existingTextSelection.sourceIndex',
    'setExistingTextSelection(',
    'honors a matching direct on-page selection and publishes Inspector changes back to editor state',
    'ignores stale direct selection from another revision or PageId',
  ],
);

requireTokens(
  'mobile Inspector routing',
  mobile + mobileTests,
  [
    "inspectorTab === 'text'",
    'existingTextSelection !== null',
    'hasInspectorContent',
    'renders MobileSheet with Inspector Content for direct existing-PDF text selection',
  ],
);

forbidTokens(
  'no widened mutation authority',
  commandTypes,
  [
    "'RECONSTRUCT_EXISTING_TEXT'",
    "'MASK_AND_REDRAW_EXISTING_TEXT'",
    "'EDIT_EXISTING_TEXT_REGION'",
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Minimal Inspector UI',
    '### Direct on-page selection',
    'revision + PageId + PDF.js source index',
    'stale revision/PageId selection is ignored',
    'does **not** call provenance analysis',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13.1 Direct Existing Text Selection Audit FAILED ===',
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
  '=== Phase 13.1 Direct Existing Text Selection Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
