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

const annotationPersistence = requireContains(
  'src/components/workspace/useAnnotationPersistence.ts',
  [
    'const hydrated = useAnnotationStore.getState().annotations',
    'saveAnnotations(documentKey, hydrated)',
  ],
);

const historyTransactions = requireContains(
  'src/core/document-history/transactions.ts',
  [
    'const annotations = normalizeAnnotationPageAnchors(',
    'saveAnnotations(state.documentKey, annotations)',
    'normalizeAnnotationPageAnchors(state.annotations, state.pageGraph)',
  ],
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
void annotationPersistence;
void historyTransactions;

const writerTypes = requireContains('src/core/writer-v2/types.ts', [
  'pageId?: PageId',
  'pageIndex: number',
]);

const writerAnchors = requireContains('src/core/writer-v2/writerPageAnchor.ts', [
  'normalizeWriterPageAnchors',
  'reanchorWriterElementsAfterPageGraphChange',
  'duplicateWriterElementsByPageGraph',
  'rebindWriterElementsByPageIndex',
]);

const writerStore = requireContains('src/core/writer-v2/writerV2Store.ts', [
  'normalizeWriterCommandElements',
  'writerElementForTargetPage',
  "beforeStore.documentMeta?.mode === 'pdfOverlay'",
]);

const writerPersistence = requireContains(
  'src/core/writer-v2/persistence/writerPersistenceController.ts',
  [
    'normalizeWriterPageAnchors',
    'writerElementsEquivalent',
  ],
);

const writerAutosave = requireContains(
  'src/core/writer-v2/persistence/writerAutosave.ts',
  ['normalizeWriterPageAnchors'],
);

for (const retiredToken of [
  'remapWriterAfterDelete(',
  'remapWriterAfterDuplicate(',
  'remapWriterAfterInsert(',
  'remapWriterAfterReorder(',
]) {
  if (commandDispatch.includes(retiredToken)) {
    failures.push(
      `structural Writer remapping must be PageId-first; dispatch still contains ${retiredToken}`,
    );
  }
}

for (const requiredToken of [
  'activePdfOverlayWriterElements',
  'reanchorWriterElementsAfterPageGraphChange',
  'duplicateWriterElementsByPageGraph',
  'rebindWriterElementsByPageIndex',
]) {
  if (!commandDispatch.includes(requiredToken)) {
    failures.push(`command dispatch missing Writer PageId token: ${requiredToken}`);
  }
}

if (!documentTransaction.includes('writerElementsToCommit')) {
  failures.push('document transaction must normalize Writer elements against target PageGraph');
}

const historyTypeSource = read('src/core/document-history/types.ts');
const historyRestoreSource = read('src/core/document-history/transactions.ts');
if (!historyTypeSource.includes('documentMode?: WriterDocumentMode')) {
  failures.push('Writer history must retain document mode for blank/PDF identity isolation');
}
if (!historyRestoreSource.includes("state.writer.documentMode === 'blankDocument'")) {
  failures.push('history restore must keep blank Writer paging outside PDF PageGraph normalization');
}

void writerTypes;
void writerAnchors;
void writerStore;
void writerPersistence;
void writerAutosave;

const ocrTypes = requireContains('src/core/ocr/types.ts', [
  'pageId?: PageId',
  'export interface OcrReviewFocus',
]);

const ocrAnchors = requireContains('src/core/ocr/ocrPageAnchor.ts', [
  'normalizeOcrPageAnchoredState',
  'reanchorOcrPageStateAfterPageGraphChange',
  'rekeyOcrPageAnchoredState',
  'transformRectForRotation',
]);

const ocrStore = requireContains('src/core/ocr/ocrStore.ts', [
  'normalizeOcrPageAnchoredState',
  'pageIdForOcrPageIndex',
  'snapshot.job.documentFingerprint !== activeDocumentKey',
  'result.documentFingerprint !== activeDocumentKey',
]);

if (!historyTypeSource.includes('ocr?: OcrPageAnchoredState')) {
  failures.push('document history must retain OCR page-scoped state');
}

for (const requiredToken of [
  'currentOcrPageState',
  'commitOcrPageState',
  'reanchorOcrPageStateAfterPageGraphChange',
  'rekeyOcrPageAnchoredState',
  'ocr: cloneOcrPageAnchoredState(ocrBefore)',
  'ocr: cloneOcrPageAnchoredState(ocrAfter)',
]) {
  if (!documentTransaction.includes(requiredToken)) {
    failures.push(`document transaction missing OCR state token: ${requiredToken}`);
  }
}

for (const requiredToken of [
  "state.ocr",
  'normalizeOcrPageAnchoredState',
  'activeJobId: null',
  'jobs: []',
]) {
  if (!historyRestoreSource.includes(requiredToken)) {
    failures.push(`history restore missing OCR token: ${requiredToken}`);
  }
}

if (!commandDispatch.includes('invalidatePageIds: [targetPageId]')) {
  failures.push('REPLACE_PAGE must invalidate OCR attached to replaced page content');
}

for (const requiredToken of [
  'rebindByPageIndex: true',
  'clearIfPageCountChanged: true',
]) {
  if (!commandDispatch.includes(requiredToken)) {
    failures.push(`opaque working-copy OCR policy missing: ${requiredToken}`);
  }
}

void ocrTypes;
void ocrAnchors;
void ocrStore;

const sessionNavigationTypes = requireContains('src/core/session/types.ts', [
  'selectedPageIds: PageId[]',
  'currentPageId: PageId | null',
  'selectedPages: number[]',
  'currentPage: number',
]);

const sessionNavigationStore = requireContains('src/core/session/store.ts', [
  'setPageById',
  'setSelectedPageIds',
  'resolveNavigationForGraph',
  'selectedPageIds: navigation.selectedPageIds',
  'currentPageId: navigation.currentPageId',
]);

for (const requiredToken of [
  'selectedPageIds: PageId[]',
  'currentPageId: PageId | null',
]) {
  if (!historyTypeSource.includes(requiredToken)) {
    failures.push(`document history missing navigation identity: ${requiredToken}`);
  }
}

for (const requiredToken of [
  'setSelectedPageIds(state.selectedPageIds)',
  'setPageById(state.currentPageId)',
]) {
  if (!historyRestoreSource.includes(requiredToken)) {
    failures.push(`history restore missing PageId navigation token: ${requiredToken}`);
  }
}

for (const requiredToken of [
  'selectedPageIds: [...sessionSnapshot.selectedPageIds]',
  'currentPageId: sessionSnapshot.viewState.currentPageId',
  'selectedPageIds: [...sessionAfter.selectedPageIds]',
  'currentPageId: sessionAfter.viewState.currentPageId',
]) {
  if (!documentTransaction.includes(requiredToken)) {
    failures.push(`document transaction missing PageId navigation snapshot: ${requiredToken}`);
  }
}

void sessionNavigationTypes;
void sessionNavigationStore;

const pageLabelReader = requireContains('src/core/pages/pdfPageLabels.ts', [
  'getPageLabels()',
  'labels.length !== doc.numPages',
  'Unable to read PDF page labels; using physical page numbers',
]);

const pageLabelDomain = requireContains('src/core/pages/pageLabels.ts', [
  'applyResolvedPageLabels',
  'clearResolvedPageLabels',
  'delete next.logicalLabel',
]);

for (const requiredToken of [
  'readResolvedPdfPageLabels',
  'applyResolvedPageLabels',
]) {
  if (!openPdf.includes(requiredToken) && !read('src/core/pages/pageGraphAdmission.ts').includes(requiredToken)) {
    failures.push(`PageGraph admission missing PageLabels token: ${requiredToken}`);
  }
}

const labelInvalidationCount =
  commandDispatch.match(/clearResolvedPageLabels\(/g)?.length ?? 0;
if (labelInvalidationCount < 7) {
  failures.push(
    `order/count-changing structural commands must invalidate resolved PageLabels; found ${labelInvalidationCount} invalidation sites`,
  );
}

void pageLabelReader;
void pageLabelDomain;

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
