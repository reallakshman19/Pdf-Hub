import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import type { WriterTableData } from '../types';
import { sanitizeClipboardHtml } from './sanitizeClipboardHtml';
import {
  clipboardHtmlContainsTable,
  extractFirstTableFromClipboardHtml,
} from './tableImport';
import { extractImageAssetsFromClipboardData } from './imageAssetStore';

export interface ImportedWriterClipboardData {
  source: 'html' | 'text' | 'image' | 'mixed' | 'empty';
  sanitizedHtml: string;
  plainText: string;
  hasTable: boolean;
  tableData: WriterTableData | null;
  assets: WriterAssetRecordV2[];
}

export async function importClipboardDataForWriter(
  clipboardData: Pick<DataTransfer, 'getData' | 'files' | 'items'>,
  documentFingerprint: string,
): Promise<ImportedWriterClipboardData> {
  const rawHtml = clipboardData.getData('text/html') ?? '';
  const plainText = clipboardData.getData('text/plain') ?? '';
  const sanitizedHtml = sanitizeClipboardHtml(rawHtml);
  const assets = await extractImageAssetsFromClipboardData(
    clipboardData,
    documentFingerprint,
  );

  const hasHtml = sanitizedHtml.trim().length > 0;
  const hasText = plainText.trim().length > 0;
  const hasImages = assets.length > 0;

  const hasTable = hasHtml && clipboardHtmlContainsTable(sanitizedHtml);
  const tableData = hasTable
    ? extractFirstTableFromClipboardHtml(sanitizedHtml)
    : null;

  return {
    source: resolveSource(hasHtml, hasText, hasImages),
    sanitizedHtml,
    plainText,
    hasTable,
    tableData,
    assets,
  };
}

function resolveSource(
  hasHtml: boolean,
  hasText: boolean,
  hasImages: boolean,
): ImportedWriterClipboardData['source'] {
  const count = [hasHtml, hasText, hasImages].filter(Boolean).length;

  if (count > 1) return 'mixed';
  if (hasHtml) return 'html';
  if (hasText) return 'text';
  if (hasImages) return 'image';
  return 'empty';
}
