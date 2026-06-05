import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { writerElementsToPortableBlocks } from './docx/writerElementsToPortableBlocks';
import { buildWriterDocxDocument } from './docx/buildWriterDocxDocument';
import { createWriterDocxAssetResolver } from './docx/writerDocxAssetResolver';
import { DOCX_MIME } from './docx/docxUnits';
import type {
  WriterDocxExportDiagnostic,
  WriterDocxPortableBlockResult,
} from './docx/types';

export interface WriterDocxExporterInput {
  elements: WriterElementV2[];
  assets?: WriterAssetRecordV2[];
  title?: string;
}

export interface WriterDocxExporterResult {
  bytes: Uint8Array;
  mimeType: typeof DOCX_MIME;
  diagnostics: WriterDocxExportDiagnostic[];
  blockResult: WriterDocxPortableBlockResult;
  exportedElementCount: number;
  skippedHiddenElementCount: number;
  fatal: boolean;
}

export async function exportWriterDocx(
  input: WriterDocxExporterInput,
): Promise<WriterDocxExporterResult> {
  const blockResult = writerElementsToPortableBlocks(input.elements);

  const documentResult = await buildWriterDocxDocument({
    blocks: blockResult.blocks,
    assets: createWriterDocxAssetResolver(input.assets),
    title: input.title,
  });

  const diagnostics = [
    ...blockResult.diagnostics,
    ...documentResult.diagnostics,
  ];

  const fatal = blockResult.fatal
    || diagnostics.some((diagnostic) => diagnostic.level === 'error');

  return {
    bytes: documentResult.bytes,
    mimeType: DOCX_MIME,
    diagnostics,
    blockResult,
    exportedElementCount: blockResult.exportedElementCount,
    skippedHiddenElementCount: blockResult.skippedHiddenElementCount,
    fatal,
  };
}
