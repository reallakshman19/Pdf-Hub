import { useWriterV2Store } from '../writerV2Store';
import {
  importPdfHubWriterProject,
  type ImportPdfHubProjectResult,
} from './projectZip';

export interface ImportedProjectSession {
  originalPdfBytes: Uint8Array;
  documentFingerprint: string;
  elementCount: number;
  assetCount: number;
}

export async function importProjectIntoWriterStore(
  projectBytes: Uint8Array,
): Promise<ImportedProjectSession> {
  const imported = await importPdfHubWriterProject(projectBytes);

  hydrateImportedProject(imported);

  return {
    originalPdfBytes: imported.originalPdfBytes,
    documentFingerprint: imported.manifest.documentFingerprint,
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
  });
}
