import {
  createBestAvailableWriterPersistence,
  type WriterAssetRecordV2,
} from '../persistence/indexedDbWriterStore';
import type { WriterElementV2 } from '../types';
import {
  exportWriterDocx,
  type WriterDocxExporterResult,
} from './writerDocxExporter';

export interface ExportCurrentWriterDocxInput {
  /**
   * Current PDF/document fingerprint.
   * Usually use sessionStore.documentKey.
   */
  documentFingerprint?: string;

  /**
   * Optional direct element override for tests or caller-owned export flows.
   * If omitted, the exporter loads the current persisted Writer document.
   */
  elements?: WriterElementV2[];

  /**
   * Optional direct asset override for tests or caller-owned export flows.
   * If omitted, the exporter loads Writer assets from persistence.
   */
  assets?: WriterAssetRecordV2[];

  title?: string;
}

export async function exportCurrentWriterDocx(
  input: ExportCurrentWriterDocxInput,
): Promise<WriterDocxExporterResult> {
  const persistence = createBestAvailableWriterPersistence();

  let elements = input.elements;
  let assets = input.assets;

  if (!elements) {
    if (!input.documentFingerprint) {
      throw new Error(
        'No Writer document fingerprint was provided for DOCX export.',
      );
    }

    const record = await persistence.loadDocument(input.documentFingerprint);

    if (!record) {
      throw new Error(
        'No saved Writer V2 document was found for DOCX export. Save/autosave the Writer draft before exporting DOCX.',
      );
    }

    elements = record.elements;
  }

  if (!assets) {
    assets = input.documentFingerprint
      ? await persistence.listAssets(input.documentFingerprint)
      : [];
  }

  return exportWriterDocx({
    elements,
    assets,
    title: input.title,
  });
}
