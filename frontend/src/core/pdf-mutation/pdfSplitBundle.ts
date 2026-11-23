import JSZip from 'jszip';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';

export interface SplitZipBundleResult {
  zipBytes: Uint8Array;
  fileCount: number;
  entryNames: string[];
}

/**
 * Splits selected pages from a source PDF into individual single-page PDF files
 * and packages them into a compressed ZIP bundle.
 */
export async function createSplitPagesZipBundle(
  sourceBytes: Uint8Array,
  pageIndices: readonly number[],
  baseFileName: string,
  options?: { signal?: AbortSignal },
): Promise<SplitZipBundleResult> {
  if (pageIndices.length === 0) {
    throw new Error('Cannot create split zip bundle with empty page indices.');
  }

  const lib = await pdfLib();
  const sourceDoc = await lib.PDFDocument.load(sourceBytes);
  const totalPages = sourceDoc.getPageCount();
  const zip = new JSZip();
  const cleanBase = baseFileName.replace(/\.[^/.]+$/, '').trim() || 'document';
  const entryNames: string[] = [];

  const padDigits = Math.max(3, String(totalPages).length);

  for (let i = 0; i < pageIndices.length; i += 1) {
    throwIfAborted(options?.signal, 'create split zip bundle');
    const pageIndex = pageIndices[i];
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) {
      throw new Error(`Page index ${pageIndex} is out of bounds [0..${totalPages - 1}].`);
    }

    const singlePageDoc = await lib.PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(sourceDoc, [pageIndex]);
    if (copiedPage) {
      singlePageDoc.addPage(copiedPage);
    }
    const pdfBytes = await singlePageDoc.save();

    const pageNumStr = String(pageIndex + 1).padStart(padDigits, '0');
    const entryName = `${cleanBase}_page_${pageNumStr}.pdf`;

    zip.file(entryName, pdfBytes);
    entryNames.push(entryName);
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    zipBytes,
    fileCount: entryNames.length,
    entryNames,
  };
}
