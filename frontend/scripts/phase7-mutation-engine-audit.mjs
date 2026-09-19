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
    'applyMutation',
  ]);
  forbidContains(rotateHandler, dispatchPath, [
    'PdfEditAdapter.rotatePages',
    'PDFDocument.load',
    "from 'pdf-lib'",
  ]);
}

const structuralCommandTypes = [
  'REORDER_PAGES',
  'REORDER_PAGES_BY_ORDER',
  'DELETE_PAGES',
  'INSERT_BLANK_PAGE',
  'DUPLICATE_PAGES',
];

requireContains(dispatch, dispatchPath, [
  'usesStructuralMutationSession',
  'requireStructuralMutationSession',
  'assertMutationSessionPageCount',
  'structuralMutationSession?.dispose()',
  'mutationSession.reorderPages',
  'mutationSession.removePages',
  'mutationSession.insertBlankPage',
  'mutationSession.duplicatePages',
]);

forbidContains(dispatch, dispatchPath, [
  'PdfEditAdapter.reorderPages',
  'PdfEditAdapter.insertBlankPage',
  'PdfEditAdapter.duplicatePages',
]);

for (const commandType of structuralCommandTypes) {
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
    'requireStructuralMutationSession',
    'mutationSession.commit',
  ]);

  if (commandType === 'DELETE_PAGES') {
    requireContains(commandCase, dispatchPath, [
      'mutationSession.removePages',
    ]);
    forbidContains(commandCase, dispatchPath, [
      'PdfEditAdapter.removePages',
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
    'PdfEditAdapter.removePages',
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
  'session.commit',
]);

if (failed) {
  process.exit(1);
}

console.log(
  '[phase7-mutation-engine] contract, rotation/structural sessions, and single-parse guards passed',
);
