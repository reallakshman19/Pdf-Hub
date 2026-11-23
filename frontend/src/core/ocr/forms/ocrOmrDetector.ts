/**
 * Optical Mark Recognition (OMR) Engine for Checkboxes and Radio Buttons.
 *
 * Evaluates binary pixel fill ratios and text markup symbols to classify
 * form marks as 'checked', 'unchecked', or 'indeterminate', and associates
 * adjacent text labels.
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain logic, no console.log.
 */

import type { OcrPageResult, PdfRect } from '../types';
import type { OcrOmrMark, OcrOmrMarkType, OcrOmrState } from './formTypes';

export interface OmrDetectionOptions {
  checkFillThreshold?: number; // default 0.30
  uncheckFillThreshold?: number; // default 0.12
  maxLabelGapPt?: number; // default 60
}

const DEFAULT_OMR_OPTIONS: Required<OmrDetectionOptions> = {
  checkFillThreshold: 0.30,
  uncheckFillThreshold: 0.12,
  maxLabelGapPt: 60,
};

/**
 * Text symbols frequently emitted by OCR for checkboxes and radio buttons.
 */
const CHECKED_SYMBOLS = new Set(['[x]', '[X]', '[✓]', '(x)', '(X)', '(•)', '●', '■', '☑', '☒', '✓', '✔']);
const UNCHECKED_SYMBOLS = new Set(['[]', '[ ]', '()', '( )', '□', '○', '☐']);

/**
 * Evaluates the fill ratio of a rectangular patch in a grayscale/binary pixel buffer.
 * Expects pixel buffer where 0 = black (mark), 255 = white (background), or 0-255 grayscale.
 */
export function calculateBoxFillRatio(
  pixels: Uint8ClampedArray | Uint8Array,
  imageWidth: number,
  imageHeight: number,
  box: PdfRect,
  scale: number = 1,
): number {
  const startX = Math.max(0, Math.floor(box.x * scale));
  const startY = Math.max(0, Math.floor(box.y * scale));
  const endX = Math.min(imageWidth, Math.ceil((box.x + box.width) * scale));
  const endY = Math.min(imageHeight, Math.ceil((box.y + box.height) * scale));

  const w = endX - startX;
  const h = endY - startY;
  if (w <= 0 || h <= 0) return 0;

  // We inspect the inner 70% of the box to exclude the outer border frame
  const marginX = Math.floor(w * 0.15);
  const marginY = Math.floor(h * 0.15);

  let darkPixelCount = 0;
  let totalSampled = 0;

  for (let y = startY + marginY; y < endY - marginY; y++) {
    for (let x = startX + marginX; x < endX - marginX; x++) {
      const idx = (y * imageWidth + x) * 4; // Assuming RGBA
      // If single channel passed, fallback to index
      const luminance = idx < pixels.length
        ? (pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114)
        : (pixels[y * imageWidth + x] ?? 255);

      if (luminance < 128) {
        darkPixelCount++;
      }
      totalSampled++;
    }
  }

  return totalSampled > 0 ? darkPixelCount / totalSampled : 0;
}

/**
 * Determines OMR state from an evaluated fill ratio.
 */
export function classifyFillRatio(
  fillRatio: number,
  options: OmrDetectionOptions = {},
): OcrOmrState {
  const opts = { ...DEFAULT_OMR_OPTIONS, ...options };
  if (fillRatio >= opts.checkFillThreshold) {
    return 'checked';
  }
  if (fillRatio <= opts.uncheckFillThreshold) {
    return 'unchecked';
  }
  return 'indeterminate';
}

/**
 * Detects OMR marks from textual OCR symbols (e.g. "[ ] Agree", "[x] Subscribe").
 */
export function detectOmrMarksFromText(
  pageResult: OcrPageResult,
  options: OmrDetectionOptions = {},
): OcrOmrMark[] {
  const opts = { ...DEFAULT_OMR_OPTIONS, ...options };
  const marks: OcrOmrMark[] = [];
  const lines = pageResult.lines || [];
  const pageIndex = pageResult.pageIndex ?? 0;

  let counter = 1;

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed.length === 0) continue;

    // Check if line starts with a checkbox/radio symbol
    let matchedSymbol: string | null = null;
    let isChecked = false;
    let markType: OcrOmrMarkType = 'checkbox';

    for (const sym of CHECKED_SYMBOLS) {
      if (trimmed.startsWith(sym)) {
        matchedSymbol = sym;
        isChecked = true;
        markType = sym.startsWith('(') || sym === '●' || sym === '○' ? 'radio' : 'checkbox';
        break;
      }
    }

    if (!matchedSymbol) {
      for (const sym of UNCHECKED_SYMBOLS) {
        if (trimmed.startsWith(sym)) {
          matchedSymbol = sym;
          isChecked = false;
          markType = sym.startsWith('(') || sym === '○' ? 'radio' : 'checkbox';
          break;
        }
      }
    }

    if (matchedSymbol) {
      const markWidth = Math.min(line.bbox.height, 16);
      const markBbox: PdfRect = {
        x: line.bbox.x,
        y: line.bbox.y,
        width: markWidth,
        height: line.bbox.height,
      };

      const remainderText = trimmed.substring(matchedSymbol.length).trim();
      const label = remainderText.length > 0 ? remainderText : undefined;
      const labelBbox: PdfRect | undefined = label
        ? {
            x: line.bbox.x + markWidth + 4,
            y: line.bbox.y,
            width: Math.max(0, line.bbox.width - markWidth - 4),
            height: line.bbox.height,
          }
        : undefined;

      marks.push({
        id: `omr-${pageIndex}-${counter++}`,
        pageIndex,
        type: markType,
        state: isChecked ? 'checked' : 'unchecked',
        fillRatio: isChecked ? 0.85 : 0.05,
        bbox: markBbox,
        label,
        labelBbox,
      });
    }
  }

  // Cross-reference standalone symbols with right-adjacent lines
  for (const mark of marks) {
    if (!mark.label) {
      for (const candidate of lines) {
        const deltaX = candidate.bbox.x - (mark.bbox.x + mark.bbox.width);
        const verticalAligned =
          Math.abs((candidate.bbox.y + candidate.bbox.height / 2) - (mark.bbox.y + mark.bbox.height / 2)) <=
          mark.bbox.height * 0.7;

        if (deltaX >= 0 && deltaX <= opts.maxLabelGapPt && verticalAligned) {
          mark.label = candidate.text.trim();
          mark.labelBbox = candidate.bbox;
          break;
        }
      }
    }
  }

  return marks;
}
