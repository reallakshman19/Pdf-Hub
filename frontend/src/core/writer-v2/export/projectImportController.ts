import type { WriterDocumentMetaV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import {
  importPdfHubWriterProject,
  type ImportPdfHubProjectResult,
} from './projectZip';
import { extractWriterProjectFromPdf } from './roundTripPdfImport';

export interface ImportedProjectSession {
  originalPdfBytes: Uint8Array;
  documentFingerprint: string;
  documentMeta?: WriterDocumentMetaV2 | null;
  elementCount: number;
  assetCount: number;
}

export async function importProjectIntoWriterStore(
  projectBytes: Uint8Array,
): Promise<ImportedProjectSession> {
  const imported = await importPdfHubWriterProject(projectBytes);

  hydrateImportedProject(imported);

  return toSession(imported);
}

export async function importRoundTripPdfIntoWriterStore(
  pdfBytes: Uint8Array,
): Promise<ImportedProjectSession | null> {
  const imported = await extractWriterProjectFromPdf(pdfBytes);
  if (!imported) return null;

  hydrateImportedProject(imported);

  return toSession(imported);
}

function toSession(imported: ImportPdfHubProjectResult): ImportedProjectSession {
  return {
    originalPdfBytes: imported.originalPdfBytes,
    documentFingerprint: imported.manifest.documentFingerprint,
    documentMeta: imported.documentMeta,
    elementCount: imported.elements.length,
    assetCount: imported.assets.length,
  };
}

function hydrateImportedProject(imported: ImportPdfHubProjectResult): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: imported.manifest.documentFingerprint,
    elements: imported.elements,
    assetRecords: imported.assets,
    persistedAt: imported.manifest.updatedAt,
    documentMeta: imported.documentMeta,
  });
}
