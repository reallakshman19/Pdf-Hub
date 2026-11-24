import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import {
  createMarkupSpace,
  viewRectToPdfRect,
} from '@/core/pdf-annotations/markupGeometry';

export interface UniformMarginTrim {
  topPt: number;
  bottomPt: number;
  leftPt: number;
  rightPt: number;
}

export interface DetectedBoundingBox {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

export type CropMode = 'auto' | 'uniform' | 'reset';

export interface CropMarginOptions {
  mode: CropMode;
  uniformMargins?: UniformMarginTrim;
  autoPaddingPt?: number;
  pageIndices?: readonly number[];
  signal?: AbortSignal;
  /** Optional pre-computed detected content boxes per page index for auto mode */
  detectedBoxes?: Record<number, DetectedBoundingBox>;
}

export interface CropMarginResult {
  modifiedBytes: Uint8Array;
  croppedPageCount: number;
}

/**
 * Inspects a pixel buffer (RGBA) and calculates the bounding box of non-white / non-transparent content.
 * Returns coordinates converted into PDF user-space points (bottom-left origin), respecting page rotation.
 */
export function calculateContentBoundingBoxFromRgba(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  pageWidth: number,
  pageHeight: number,
  paddingPt: number = 14,
  pageRotation: number = 0,
  cropOffset: { x: number; y: number } = { x: 0, y: 0 },
): DetectedBoundingBox {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { xPt: cropOffset.x, yPt: cropOffset.y, widthPt: pageWidth, heightPt: pageHeight };
  }

  let minX = canvasWidth;
  let maxX = -1;
  let minY = canvasHeight;
  let maxY = -1;

  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const idx = (y * canvasWidth + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const a = data[idx + 3]!;

      // Check if pixel has content (not white and not fully transparent)
      const isBlank = a < 20 || (r > 245 && g > 245 && b > 245);
      if (!isBlank) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no content found (blank page), return full page bounds
  if (maxX === -1 || maxY === -1) {
    return { xPt: cropOffset.x, yPt: cropOffset.y, widthPt: pageWidth, heightPt: pageHeight };
  }

  const normRotation = ((pageRotation % 360) + 360) % 360;
  const isSwapped = normRotation === 90 || normRotation === 270;
  const viewerWidth = isSwapped ? pageHeight : pageWidth;
  const viewerHeight = isSwapped ? pageWidth : pageHeight;

  const scaleX = viewerWidth / canvasWidth;
  const scaleY = viewerHeight / canvasHeight;

  const vLeft = Math.max(0, minX * scaleX - paddingPt);
  const vTop = Math.max(0, minY * scaleY - paddingPt);
  const vRight = Math.min(viewerWidth, (maxX + 1) * scaleX + paddingPt);
  const vBottom = Math.min(viewerHeight, (maxY + 1) * scaleY + paddingPt);
  const vWidth = Math.max(50, vRight - vLeft);
  const vHeight = Math.max(50, vBottom - vTop);

  const space = createMarkupSpace(
    {
      x: cropOffset.x,
      y: cropOffset.y,
      width: pageWidth,
      height: pageHeight,
    },
    normRotation,
  );

  const [x1, y1, x2, y2] = viewRectToPdfRect(
    { x: vLeft, y: vTop, width: vWidth, height: vHeight },
    space,
  );

  return {
    xPt: x1,
    yPt: y1,
    widthPt: Math.max(50, x2 - x1),
    heightPt: Math.max(50, y2 - y1),
  };
}

/**
 * Adjusts the CropBox on selected PDF pages non-destructively, preserving MediaBox.
 */
export async function cropPdfMargins(
  sourceBytes: Uint8Array,
  options: CropMarginOptions,
): Promise<CropMarginResult> {
  throwIfAborted(options.signal, 'crop pdf margins: start');
  if (!sourceBytes || sourceBytes.length === 0) {
    throw new Error('Cannot crop margins of empty source bytes.');
  }

  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(sourceBytes);
  const totalPages = doc.getPageCount();

  if (totalPages === 0) {
    throw new Error('Cannot crop margins on an empty PDF document.');
  }

  const targetIndices = options.pageIndices && options.pageIndices.length > 0
    ? options.pageIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < totalPages)
    : Array.from({ length: totalPages }, (_, i) => i);

  if (targetIndices.length === 0) {
    throw new Error('No valid target pages found for margin cropping.');
  }

  for (const pageIdx of targetIndices) {
    throwIfAborted(options.signal, 'crop pdf margins: page');
    const page = doc.getPage(pageIdx);
    const mediaBox = page.getMediaBox();
    const currentCrop = page.getCropBox() ?? mediaBox;

    if (options.mode === 'reset') {
      // Restore crop box to full media box
      page.setCropBox(mediaBox.x, mediaBox.y, mediaBox.width, mediaBox.height);
      continue;
    }

    if (options.mode === 'uniform' && options.uniformMargins) {
      const { topPt, bottomPt, leftPt, rightPt } = options.uniformMargins;
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;

      // Map viewer-facing edges to unrotated default user space
      let unrotatedLeft = leftPt;
      let unrotatedRight = rightPt;
      let unrotatedTop = topPt;
      let unrotatedBottom = bottomPt;

      switch (rotation) {
        case 90:
          unrotatedLeft = topPt;
          unrotatedTop = rightPt;
          unrotatedRight = bottomPt;
          unrotatedBottom = leftPt;
          break;
        case 180:
          unrotatedLeft = rightPt;
          unrotatedRight = leftPt;
          unrotatedTop = bottomPt;
          unrotatedBottom = topPt;
          break;
        case 270:
          unrotatedLeft = bottomPt;
          unrotatedTop = leftPt;
          unrotatedRight = topPt;
          unrotatedBottom = rightPt;
          break;
        case 0:
        default:
          break;
      }

      const newX = currentCrop.x + unrotatedLeft;
      const newY = currentCrop.y + unrotatedBottom;
      const newWidth = currentCrop.width - unrotatedLeft - unrotatedRight;
      const newHeight = currentCrop.height - unrotatedTop - unrotatedBottom;

      // Ensure remaining crop area is at least 50x50 pt
      if (newWidth >= 50 && newHeight >= 50) {
        page.setCropBox(newX, newY, newWidth, newHeight);
      }
      continue;
    }

    if (options.mode === 'auto') {
      const detected = options.detectedBoxes?.[pageIdx];
      if (detected && detected.widthPt >= 50 && detected.heightPt >= 50) {
        page.setCropBox(detected.xPt, detected.yPt, detected.widthPt, detected.heightPt);
      } else {
        // Fallback standard conservative trim (14pt) if auto-detection box not provided
        const padding = options.autoPaddingPt ?? 14;
        const newX = currentCrop.x + padding;
        const newY = currentCrop.y + padding;
        const newWidth = currentCrop.width - 2 * padding;
        const newHeight = currentCrop.height - 2 * padding;

        if (newWidth >= 50 && newHeight >= 50) {
          page.setCropBox(newX, newY, newWidth, newHeight);
        }
      }
    }
  }

  throwIfAborted(options.signal, 'crop pdf margins: save');
  const modifiedBytes = await doc.save();

  return {
    modifiedBytes,
    croppedPageCount: targetIndices.length,
  };
}
