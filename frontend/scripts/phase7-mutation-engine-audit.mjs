import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failed = true;
  console.error(`[phase7-mutation-engine] ${message}`);
}

function requireContains(source, relativePath, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      fail(`${relativePath} is missing required marker: ${needle}`);
    }
  }
}

function forbidContains(source, relativePath, needles) {
  for (const needle of needles) {
    if (source.includes(needle)) {
      fail(`${relativePath} contains forbidden marker: ${needle}`);
    }
  }
}

const contractPath = 'src/core/pdf-mutation/types.ts';
const contract = read(contractPath);
requireContains(contract, contractPath, [
  'export interface PdfMutationEngine',
  'export interface PdfMutationSession',
  'getPageMetrics',
  'rotatePages',
  'reorderPages',
  'removePages',
  'insertBlankPage',
  'duplicatePages',
  'insertPdf',
  'replacePage',
  'appendPdfs',
  'setPageLabels',
  'drawText',
  'drawVisualMasks',
  'applyHeaderFooter',
  'replaceExistingText',
  'reconstructExistingText',
  'commit()',
  'dispose()',
]);
forbidContains(contract, contractPath, [
  'pdf-lib',
  'PDFDocument',
  'PdfEditAdapter',
  'React',
  'zustand',
]);

const adapterPath =
  'src/adapters/pdf-mutation/PdfLibMutationEngine.ts';
const adapter = read(adapterPath);
requireContains(adapter, adapterPath, [
  'class PdfLibMutationSession',
  'PDFDocument.load(input.bytes)',
  'getPageMetrics',
  'rotatePages',
  'reorderPages',
  'removePages',
  'insertBlankPage',
  'duplicatePages',
  'insertPdf',
  'replacePage',
  'appendPdfs',
  'setPageLabels',
  'drawText',
  'drawVisualMasks',
  'applyHeaderFooter',
  'replaceExistingText',
  'reconstructExistingText',
  'applySimpleExistingTextReplacementToDocument',
  'applyReconstructedExistingTextReplacementToDocument',
  'applyPdfLibHeaderFooterPlan',
  'applyPdfLibPageLabels',
  'loadDonor',
  'rebuildFromOrder',
  'this.document.save()',
  "type SessionState = 'open' | 'committed' | 'disposed'",
]);
forbidContains(adapter, adapterPath, [
  'useSessionStore',
  'useAnnotationStore',
  'useWriterV2Store',
  'useOcrStore',
  'commitDocumentMutation',
]);

const dispatchPath = 'src/core/commands/dispatch.ts';
const dispatch = read(dispatchPath);
const rotateStart = dispatch.indexOf(
  'async function executeRotatePagesCommand',
);
const dispatchStart = dispatch.indexOf(
  'export async function dispatchPdfCommand',
  rotateStart,
);
if (
  rotateStart < 0
  || dispatchStart <= rotateStart
) {
  fail('Rotation mutation-session handler boundary is missing');
} else {
  const rotateHandler = dispatch.slice(
    rotateStart,
    dispatchStart,
  );
  requireContains(rotateHandler, dispatchPath, [
    'pdfLibMutationEngine.open',
    'mutationSession.pageCount',
    'mutationSession.getPageMetrics',
    'mutationSession.rotatePages',
    'mutationSession.commit',
    'mutationSession.dispose',
    'applyCommittedSessionMutation',
  ]);
  forbidContains(rotateHandler, dispatchPath, [
    'PdfEditAdapter.rotatePages',
    'PDFDocument.load',
    "from 'pdf-lib'",
  ]);
}

const persistentSessionCommandTypes = [
  'REORDER_PAGES',
  'REORDER_PAGES_BY_ORDER',
  'DELETE_PAGES',
  'INSERT_BLANK_PAGE',
  'DUPLICATE_PAGES',
  'INSERT_PAGES',
  'REPLACE_PAGE',
  'MERGE_PDF',
  'SPLIT_PAGES',
  'SET_PAGE_LABELS',
  'DRAW_TEXT_ON_PAGES',
  'DRAW_REDACTION_BOX',
  'REPLACE_EXISTING_TEXT',
  'RECONSTRUCT_EXISTING_TEXT',
  'APPLY_HEADER_FOOTER_TEMPLATE',
];

requireContains(dispatch, dispatchPath, [
  'usesPersistentMutationSession',
  'requirePersistentMutationSession',
  'assertMutationSessionPageCount',
  'commandMutationSession?.dispose()',
  'mutationSession.reorderPages',
  'mutationSession.removePages',
  'mutationSession.insertBlankPage',
  'mutationSession.duplicatePages',
  'mutationSession.insertPdf',
  'mutationSession.replacePage',
  'mutationSession.appendPdfs',
  'mutationSession.setPageLabels',
  'mutationSession.drawText',
  'mutationSession.drawVisualMasks',
  'mutationSession.replaceExistingText',
  'mutationSession.reconstructExistingText',
  'mutationSession.applyHeaderFooter',
  'commitStructuralMutationSession',
  'applyCommittedSessionMutation',
  'revisionMetadata',
]);

forbidContains(dispatch, dispatchPath, [
  'PdfEditAdapter.reorderPages',
  'PdfEditAdapter.insertBlankPage',
  'PdfEditAdapter.duplicatePages',
  'PdfEditAdapter.insertAt',
  'PdfEditAdapter.replacePage',
  'PdfEditAdapter.merge',
  'PdfEditAdapter.removePages',
  'PdfEditAdapter.drawTextOnPages',
  'PdfEditAdapter.drawRedactionBoxes',
]);

for (const commandType of persistentSessionCommandTypes) {
  const caseStart = dispatch.indexOf(
    `case '${commandType}': {`,
  );
  if (caseStart < 0) {
    fail(`Canonical structural case is missing: ${commandType}`);
    continue;
  }

  const nextCase = dispatch.indexOf(
    "\n      case '",
    caseStart + 1,
  );
  const commandCase = dispatch.slice(
    caseStart,
    nextCase > caseStart ? nextCase : undefined,
  );

  requireContains(commandCase, dispatchPath, [
    'requirePersistentMutationSession',
    'applyCommittedSessionMutation',
  ]);

  const requiredMutationCall = {
    REORDER_PAGES: 'mutationSession.reorderPages',
    REORDER_PAGES_BY_ORDER: 'mutationSession.reorderPages',
    DELETE_PAGES: 'mutationSession.removePages',
    INSERT_BLANK_PAGE: 'mutationSession.insertBlankPage',
    DUPLICATE_PAGES: 'mutationSession.duplicatePages',
    INSERT_PAGES: 'mutationSession.insertPdf',
    REPLACE_PAGE: 'mutationSession.replacePage',
    MERGE_PDF: 'mutationSession.appendPdfs',
    SPLIT_PAGES: 'mutationSession.removePages',
    SET_PAGE_LABELS: 'mutationSession.setPageLabels',
    DRAW_TEXT_ON_PAGES: 'mutationSession.drawText',
    DRAW_REDACTION_BOX: 'mutationSession.drawVisualMasks',
    REPLACE_EXISTING_TEXT:
      'mutationSession.replaceExistingText',
    RECONSTRUCT_EXISTING_TEXT:
      'mutationSession.reconstructExistingText',
    APPLY_HEADER_FOOTER_TEMPLATE:
      'mutationSession.applyHeaderFooter',
  }[commandType];

  const requiredCommitCall = new Set([
    'SET_PAGE_LABELS',
    'DRAW_TEXT_ON_PAGES',
    'DRAW_REDACTION_BOX',
    'REPLACE_EXISTING_TEXT',
    'RECONSTRUCT_EXISTING_TEXT',
    'APPLY_HEADER_FOOTER_TEMPLATE',
  ]).has(commandType)
    ? 'mutationSession.commit'
    : 'commitStructuralMutationSession';

  if (requiredMutationCall) {
    requireContains(commandCase, dispatchPath, [
      requiredMutationCall,
      requiredCommitCall,
    ]);
  }
}

const splitStart = dispatch.indexOf("case 'SPLIT_PAGES': {");
if (splitStart >= 0) {
  const splitEnd = dispatch.indexOf(
    "\n      case '",
    splitStart + 1,
  );
  const splitCase = dispatch.slice(
    splitStart,
    splitEnd > splitStart ? splitEnd : undefined,
  );
  requireContains(splitCase, dispatchPath, [
    'PdfEditAdapter.extractPages',
    'mutationSession.removePages',
    'commitStructuralMutationSession',
  ]);
  forbidContains(splitCase, dispatchPath, [
    'PdfEditAdapter.removePages',
  ]);
}

const pageLabelPlanPath =
  'src/core/pages/pageLabelMutationPlan.ts';
const pageLabelPlan = read(pageLabelPlanPath);
requireContains(pageLabelPlan, pageLabelPlanPath, [
  'planPdfPageLabelEntries',
  'physicalIndexForPageId',
]);
forbidContains(pageLabelPlan, pageLabelPlanPath, [
  'pdf-lib',
  'PDFDocument',
  'PDFName',
]);

const tokenPath =
  'src/core/text/legacyPageTextTokens.ts';
const tokenResolver = read(tokenPath);
requireContains(tokenResolver, tokenPath, [
  'resolveLegacyPageTextTokens',
  '{{total_pages}}',
  '{{file_name}}',
]);
forbidContains(tokenResolver, tokenPath, [
  'pdf-lib',
  'PDFDocument',
]);

const headerFooterPlanPath =
  'src/core/header-footer/mutationPlan.ts';
const headerFooterPlan = read(headerFooterPlanPath);
requireContains(
  headerFooterPlan,
  headerFooterPlanPath,
  [
    'compileHeaderFooterMutationPlan',
    'physicalPageNumber - 1',
    'PdfMutationHeaderFooterPage',
  ],
);
forbidContains(
  headerFooterPlan,
  headerFooterPlanPath,
  [
    'pdf-lib',
    'PDFDocument',
    'PdfEditAdapter',
  ],
);

const headerFooterAdapterPath =
  'src/adapters/pdf-mutation/pdfLibHeaderFooter.ts';
const headerFooterAdapter = read(
  headerFooterAdapterPath,
);
requireContains(
  headerFooterAdapter,
  headerFooterAdapterPath,
  [
    'applyPdfLibHeaderFooterPlan',
    'renderPdfMutationHeaderFooterPage',
    'document.getPage(resolved.pageIndex)',
  ],
);

const headerFooterCaseStart = dispatch.indexOf(
  "case 'APPLY_HEADER_FOOTER_TEMPLATE': {",
);
if (headerFooterCaseStart >= 0) {
  const headerFooterCaseEnd = dispatch.indexOf(
    "\n      case '",
    headerFooterCaseStart + 1,
  );
  const headerFooterCase = dispatch.slice(
    headerFooterCaseStart,
    headerFooterCaseEnd > headerFooterCaseStart
      ? headerFooterCaseEnd
      : undefined,
  );
  requireContains(
    headerFooterCase,
    dispatchPath,
    [
      'prepareHeaderFooterTemplateMutation',
      'mutationSession.applyHeaderFooter',
      'mutationSession.commit',
    ],
  );
  forbidContains(
    headerFooterCase,
    dispatchPath,
    [
      'executeHeaderFooterTemplateMutation',
      'pdfLibHeaderFooterWriter',
      'PDFDocument.load',
    ],
  );
}

const transactionPath =
  'src/core/commands/transaction/documentTransaction.ts';
const transaction = read(transactionPath);
requireContains(transaction, transactionPath, [
  'export interface DocumentMutationRevisionMetadata',
  'revisionMetadata?: DocumentMutationRevisionMetadata',
  'validatedRevisionPageCounts',
  'input.revisionMetadata',
  'sessionSnapshot.pageCount',
  'PdfEditAdapter.countPages(input.beforeBytes)',
  'PdfEditAdapter.countPages(input.afterBytes)',
  'FileAdapter.hashBytes(input.afterBytes)',
]);
forbidContains(transaction, transactionPath, [
  'revisionMetadata: any',
]);

const transactionTestPath =
  'src/core/commands/transaction/documentTransaction.history.test.ts';
const transactionTest = read(transactionTestPath);
requireContains(transactionTest, transactionTestPath, [
  'uses supplied revision metadata without reparsing PDF page counts',
  'pdfMocks.countPages).not.toHaveBeenCalled()',
  'rejects stale revision metadata during prepare',
  'retains parse-based page-count fallback when revision metadata is absent',
  'pdfMocks.countPages).toHaveBeenCalledTimes(2)',
]);

const applyWorkingCopyStart = dispatch.indexOf(
  "case 'APPLY_WORKING_COPY': {",
);
if (applyWorkingCopyStart >= 0) {
  const applyWorkingCopy = dispatch.slice(
    applyWorkingCopyStart,
  );
  requireContains(applyWorkingCopy, dispatchPath, [
    'applyMutation(',
    'ocrPagePolicy',
  ]);
  forbidContains(applyWorkingCopy, dispatchPath, [
    'applyCommittedSessionMutation(',
  ]);
}

const engineTestPath =
  'src/adapters/pdf-mutation/PdfLibMutationEngine.test.ts';
const engineTest = read(engineTestPath);
requireContains(engineTest, engineTestPath, [
  "vi.spyOn(PDFDocument, 'load')",
  'toHaveBeenCalledTimes(1)',
  'session.getPageMetrics',
  'session.rotatePages',
  'session.reorderPages',
  'session.duplicatePages',
  'session.removePages',
  'session.insertBlankPage',
  'session.insertPdf',
  'session.appendPdfs',
  'session.replacePage',
  'session.setPageLabels',
  'session.drawText',
  'session.drawVisualMasks',
  'session.applyHeaderFooter',
  'session.replaceExistingText',
  'session.commit',
  'loadSpy).toHaveBeenCalledTimes(4)',
]);

if (failed) {
  process.exit(1);
}

console.log(
  '[phase7-mutation-engine] mutation sessions, resolved content writes, revision metadata, and parse-scope guards passed',
);
