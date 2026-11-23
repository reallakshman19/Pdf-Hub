import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';

export type PageDimensionPreset = 'A4' | 'Letter' | 'Legal' | 'A3' | 'MatchFirstPage' | 'Custom';

export interface PageDimension {
  width: number;
  height: number;
}

export const PRESET_DIMENSIONS: Record<Exclude<PageDimensionPreset, 'MatchFirstPage' | 'Custom'>, PageDimension> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
  A3: { width: 841.89, height: 1190.55 },
};

export type NormalizationStrategy = 'fit' | 'center' | 'expand';

export interface NormalizeOptions {
  preset: PageDimensionPreset;
  customDimensions?: PageDimension;
  strategy: NormalizationStrategy;
  pageIndices?: readonly number[];
  orientation?: 'preserve' | 'portrait' | 'landscape';
  signal?: AbortSignal;
}

export interface NormalizeResult {
  normalizedBytes: Uint8Array;
  modifiedPageCount: number;
  targetDimensions: PageDimension;
}

/**
 * Normalizes the dimensions (mediaBox) of selected pages in a PDF document non-destructively.
 */
export async function normalizePdfPageDimensions(
  sourceBytes: Uint8Array,
  options: NormalizeOptions,
): Promise<NormalizeResult> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(sourceBytes);
  const totalPages = doc.getPageCount();

  if (totalPages === 0) {
    throw new Error('Cannot normalize an empty PDF document.');
  }

  // Determine base target dimension
  let baseTarget: PageDimension;
  if (options.preset === 'MatchFirstPage') {
    const firstPage = doc.getPage(0);
    baseTarget = { width: firstPage.getWidth(), height: firstPage.getHeight() };
  } else if (options.preset === 'Custom') {
    if (!options.customDimensions || options.customDimensions.width <= 0 || options.customDimensions.height <= 0) {
      throw new Error('Custom preset requires valid positive width and height dimensions.');
    }
    baseTarget = { ...options.customDimensions };
  } else {
    baseTarget = { ...PRESET_DIMENSIONS[options.preset] };
  }

  const targetIndices = options.pageIndices && options.pageIndices.length > 0
    ? options.pageIndices.slice()
    : Array.from({ length: totalPages }, (_, i) => i);

  for (const pageIdx of targetIndices) {
    if (!Number.isInteger(pageIdx) || pageIdx < 0 || pageIdx >= totalPages) {
      throw new Error(`Page index ${pageIdx} is out of bounds [0..${totalPages - 1}].`);
    }
  }

  for (const pageIdx of targetIndices) {
    throwIfAborted(options.signal, 'normalize pdf dimensions');
    const page = doc.getPage(pageIdx);
    const origWidth = page.getWidth();
    const origHeight = page.getHeight();

    // Determine target width/height based on orientation preference
    let targetWidth = baseTarget.width;
    let targetHeight = baseTarget.height;

    const origIsLandscape = origWidth > origHeight;
    const targetIsLandscape = targetWidth > targetHeight;

    if (options.orientation === 'preserve') {
      if (origIsLandscape !== targetIsLandscape) {
        // Swap to preserve orientation
        const tmp = targetWidth;
        targetWidth = targetHeight;
        targetHeight = tmp;
      }
    } else if (options.orientation === 'portrait') {
      if (targetWidth > targetHeight) {
        const tmp = targetWidth;
        targetWidth = targetHeight;
        targetHeight = tmp;
      }
    } else if (options.orientation === 'landscape') {
      if (targetWidth < targetHeight) {
        const tmp = targetWidth;
        targetWidth = targetHeight;
        targetHeight = tmp;
      }
    }

    if (options.strategy === 'fit') {
      const scale = Math.min(targetWidth / origWidth, targetHeight / origHeight);
      page.scale(scale, scale);
      const scaledWidth = origWidth * scale;
      const scaledHeight = origHeight * scale;
      const offsetX = (targetWidth - scaledWidth) / 2;
      const offsetY = (targetHeight - scaledHeight) / 2;
      page.translateContent(offsetX, offsetY);
      page.setSize(targetWidth, targetHeight);
    } else if (options.strategy === 'center') {
      const offsetX = (targetWidth - origWidth) / 2;
      const offsetY = (targetHeight - origHeight) / 2;
      page.translateContent(offsetX, offsetY);
      page.setSize(targetWidth, targetHeight);
    } else {
      // 'expand'
      page.setSize(targetWidth, targetHeight);
    }
  }

  const normalizedBytes = await doc.save();
  return {
    normalizedBytes,
    modifiedPageCount: targetIndices.length,
    targetDimensions: baseTarget,
  };
}
