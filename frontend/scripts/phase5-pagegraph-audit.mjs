import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireContains(relativePath, tokens) {
  const source = read(relativePath);
  for (const token of tokens) {
    if (!source.includes(token)) {
      failures.push(`${relativePath} missing required PageGraph token: ${token}`);
    }
  }
  return source;
}

const sessionTypes = requireContains('src/core/session/types.ts', [
  'pageGraph: PageGraph<PageNode> | null',
]);

const sessionStore = requireContains('src/core/session/store.ts', [
  'pageGraph: pageGraph ?? null',
  'pageGraph: null',
  'rekeyPageGraph',
]);

if (sessionStore.includes('pdf-renderer') || sessionStore.includes('pageGraphAdmission')) {
  failures.push('SessionStore must not depend on the renderer-backed PageGraph admission module');
}

const openPdf = requireContains('src/core/admission/openPdf.ts', [
  'buildPageGraphFromPdfBytes',
  'pageGraph.pages.length',
  'pageGraph,',
]);
if (openPdf.includes('PdfEditAdapter.countPages')) {
  failures.push('Primary PDF admission must not separately parse pageCount with PdfEditAdapter');
}

for (const relativePath of [
  'src/hooks/useMockPdf.ts',
  'src/components/writer-v2/WriterV2ToolbarControls.tsx',
  'src/core/writer-v2/export/projectImportController.ts',
]) {
  requireContains(relativePath, ['buildPageGraphFromPdfBytes', 'pageGraph']);
}

const historyTypes = requireContains('src/core/document-history/types.ts', [
  'pageGraph: PageGraph<PageNode> | null',
]);

const historyRestore = requireContains('src/core/document-history/transactions.ts', [
  'setPageGraph(',
  'clonePageGraph(state.pageGraph)',
]);

const documentTransaction = requireContains(
  'src/core/commands/transaction/documentTransaction.ts',
  [
    'nextPageGraph?: PageGraph<PageNode> | null',
    'pageGraph: sessionSnapshot.pageGraph',
    'pageGraph: sessionAfter.pageGraph',
    'rekeyPageGraph(pageGraphForCommit, nextDocumentKey)',
  ],
);

const commandDispatch = requireContains('src/core/commands/dispatch.ts', [
  'resolveStructuralPageGraph',
  'rotatePagesInGraph',
  'reorderPageGraphByOrder',
  'removePagesFromGraph',
  'insertPagesIntoGraph',
  'replacePageGraphContent',
  'duplicatePagesInGraph',
  'buildImportedDonorNodes',
]);

if (commandDispatch.includes('PdfEditAdapter.getPageSize(context.workingBytes')) {
  failures.push('ROTATE_PAGES must use cached PageGraph metrics instead of reparsing page size');
}

if (commandDispatch.includes('PdfEditAdapter.movePage(context.workingBytes')) {
  failures.push('REORDER_PAGES must use the same explicit permutation for PDF bytes and dependent state');
}

void historyTypes;
void historyRestore;
void documentTransaction;

const annotationTypes = requireContains('src/core/annotations/types.ts', [
  'pageId?: PageId',
  'pageNumber: number',
]);

const annotationStore = requireContains('src/core/annotations/store.ts', [
  'normalizeAnnotationPageAnchors',
  'annotationForTargetPage',
]);

const annotationAnchors = requireContains('src/core/annotations/pageAnchor.ts', [
  'normalizeAnnotationPageAnchors',
  'reanchorAnnotationsAfterPageGraphChange',
  'duplicateAnnotationsByPageGraph',
  'rebindAnnotationsByPageNumber',
]);

const reviewTypes = requireContains('src/core/review/types.ts', [
  'pageId?: PageId',
]);

const historyTransactions = requireContains(
  'src/core/document-history/transactions.ts',
  ['normalizeAnnotationPageAnchors(state.annotations, state.pageGraph)'],
);

for (const retiredToken of [
  'remapAfterDelete(',
  'remapAfterDuplicate(',
  'remapAfterInsert(',
  'remapAfterReorder(',
]) {
  if (commandDispatch.includes(retiredToken)) {
    failures.push(
      `structural annotation remapping must be PageId-first; dispatch still contains ${retiredToken}`,
    );
  }
}

const setPageGraphIndex = documentTransaction.indexOf('setPageGraph(');
const setAnnotationsIndex = documentTransaction.indexOf('setAnnotations(annotationsToPersist)');
if (
  setPageGraphIndex < 0
  || setAnnotationsIndex < 0
  || setPageGraphIndex > setAnnotationsIndex
) {
  failures.push('document transaction must establish target PageGraph before annotation hydration');
}

void annotationTypes;
void annotationStore;
void annotationAnchors;
void reviewTypes;
void historyTransactions;

const admission = requireContains('src/core/pages/pageGraphAdmission.ts', [
  'PdfRendererAdapter.acquireDocument',
  'getViewport({ scale: 1, rotation: 0 })',
  'createInitialPageId',
]);

if (sessionTypes.includes('PDFDocumentProxy') || admission.includes('useSessionStore')) {
  failures.push('PageGraph dependency direction is invalid');
}

if (failures.length > 0) {
  console.error('Phase 5 PageGraph audit FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 5 PageGraph audit passed.');
