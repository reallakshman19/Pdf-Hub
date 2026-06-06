import { useWriterV2Store } from '../writerV2Store';
import {
  exportWriterDocx,
  type WriterDocxExporterResult,
} from './writerDocxExporter';

export interface ExportLiveBlankWriterDocxInput {
  title?: string;
}

export async function exportLiveBlankWriterDocx(
  input: ExportLiveBlankWriterDocxInput = {},
): Promise<WriterDocxExporterResult> {
  const state = useWriterV2Store.getState();

  if (state.documentMeta?.mode !== 'blankDocument') {
    throw new Error('No blank Writer document is active.');
  }

  return exportWriterDocx({
    elements: state.elements,
    assets: state.assetRecords,
    title: input.title ?? state.documentMeta.title,
    documentMeta: state.documentMeta,
  });
}
