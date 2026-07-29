import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { useWriterV2Store } from '../writerV2Store';
import {
  createRichTextBoxElement,
  createTextCalloutElement,
} from '../writerElementFactory';
import { exportCurrentWriterPdf } from '../export/exportCurrentWriterPdf';
import { exportCurrentWriterProject } from '../export/exportCurrentWriterProject';
import { importPdfHubWriterProject } from '../export/projectZip';

export interface WriterOverlayV2FinalSmokeResult {
  verdict: 'PASS' | 'FAIL';
  checks: Array<{
    name: string;
    passed: boolean;
    details?: Record<string, unknown>;
  }>;
  metrics: {
    sourcePageCount: number;
    flattenedPageCount: number;
    projectElementCount: number;
    importedElementCount: number;
    restoredEditableElementCount: number;
  };
}

export async function runWriterOverlayV2FinalSmoke(): Promise<WriterOverlayV2FinalSmokeResult> {
  const checks: WriterOverlayV2FinalSmokeResult['checks'] = [];

  useWriterV2Store.getState().clearWriterV2();

  const { PDFDocument } = await pdfLib();
  const originalPdfBytes = await createSamplePdf();
  const sourcePdf = await PDFDocument.load(originalPdfBytes);
  const sourcePageCount = sourcePdf.getPageCount();

  checks.push({
    name: 'sample-pdf-created',
    passed: sourcePageCount === 1,
    details: { sourcePageCount },
  });

  const richText = createRichTextBoxElement({
    documentFingerprint: 'writer-final-smoke-doc',
    pageIndex: 0,
    rect: {
      x: 72,
      y: 620,
      width: 240,
      height: 90,
    },
    text: 'Initial writer smoke text',
    zIndex: 10,
  });

  const callout = createTextCalloutElement({
    documentFingerprint: 'writer-final-smoke-doc',
    pageIndex: 0,
    rect: {
      x: 300,
      y: 500,
      width: 220,
      height: 80,
    },
    anchorPoint: {
      x: 250,
      y: 560,
    },
    text: 'Smoke callout note',
    zIndex: 11,
  });

  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'writer-final-smoke-doc',
    elements: [],
    assetRecords: [],
  });

  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'ADD_WRITER_ELEMENT',
    element: richText,
  });

  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'ADD_WRITER_ELEMENT',
    element: callout,
  });

  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: richText.id,
    patch: {
      plainText: 'Edited and saved Writer V2 content',
      editorStateJson: '{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"Edited and saved Writer V2 content","version":1}],"version":1}],"type":"root","version":1}}',
    },
    now: '2026-01-01T00:00:00.000Z',
  });

  const activeState = useWriterV2Store.getState();

  checks.push({
    name: 'writer-elements-created-and-edited',
    passed:
      activeState.elements.length === 2 &&
      activeState.elements.some((item) => item.type === 'richTextBox') &&
      activeState.elements.some((item) => item.type === 'textCallout') &&
      activeState.elements.some((item) => item.plainText === 'Edited and saved Writer V2 content'),
    details: {
      elementCount: activeState.elements.length,
      types: activeState.elements.map((item) => item.type),
    },
  });

  const flattenedPdfBytes = await exportCurrentWriterPdf({
    pdfBytes: originalPdfBytes,
  });

  const flattenedPdf = await PDFDocument.load(flattenedPdfBytes);
  const flattenedPageCount = flattenedPdf.getPageCount();

  checks.push({
    name: 'flattened-pdf-export-reloads',
    passed: flattenedPdfBytes.length > 0 && flattenedPageCount === sourcePageCount,
    details: {
      byteLength: flattenedPdfBytes.length,
      flattenedPageCount,
    },
  });

  const projectBytes = await exportCurrentWriterProject({
    originalPdfBytes,
    documentFingerprint: 'writer-final-smoke-doc',
  });

  const importedProject = await importPdfHubWriterProject(projectBytes);

  checks.push({
    name: 'editable-project-zip-roundtrip',
    passed:
      projectBytes.length > 0 &&
      importedProject.elements.length === 2 &&
      importedProject.manifest.documentFingerprint === 'writer-final-smoke-doc',
    details: {
      byteLength: projectBytes.length,
      importedElementCount: importedProject.elements.length,
      importedTypes: importedProject.elements.map((item) => item.type),
    },
  });

  useWriterV2Store.getState().clearWriterV2();
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: importedProject.manifest.documentFingerprint,
    elements: importedProject.elements,
    assetRecords: importedProject.assets,
    persistedAt: importedProject.manifest.updatedAt,
  });

  const restoredState = useWriterV2Store.getState();
  const restoredEditableElementCount = restoredState.elements.filter(
    (item) => !item.locked && !item.hidden,
  ).length;

  checks.push({
    name: 'fresh-store-project-restore-editable',
    passed:
      restoredState.currentDocumentFingerprint === 'writer-final-smoke-doc' &&
      restoredState.elements.length === 2 &&
      restoredEditableElementCount === 2 &&
      restoredState.dirty === false,
    details: {
      currentDocumentFingerprint: restoredState.currentDocumentFingerprint,
      restoredElementCount: restoredState.elements.length,
      restoredEditableElementCount,
      dirty: restoredState.dirty,
    },
  });

  const verdict = checks.every((check) => check.passed) ? 'PASS' : 'FAIL';

  return {
    verdict,
    checks,
    metrics: {
      sourcePageCount,
      flattenedPageCount,
      projectElementCount: activeState.elements.length,
      importedElementCount: importedProject.elements.length,
      restoredEditableElementCount,
    },
  };
}

async function createSamplePdf(): Promise<Uint8Array> {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);

  page.drawText('Writer Overlay V2 final smoke sample PDF', {
    x: 72,
    y: 740,
    size: 14,
  });

  return doc.save();
}