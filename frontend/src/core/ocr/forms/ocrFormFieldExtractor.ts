/**
 * Key-Value Form Field Extraction Engine.
 *
 * Automatically detects and links label-value pairs in unstructured OCR output
 * using spatial alignment, punctuation heuristics, and bounding-box geometry.
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain logic, no console.log.
 */

import type { OcrPageResult, OcrLine, OcrWord, PdfRect } from '../types';
import type { OcrKeyValuePair } from './formTypes';

export interface FormExtractionOptions {
  minConfidence?: number;
  maxHorizontalGapPt?: number;
  maxVerticalGapPt?: number;
}

const DEFAULT_OPTIONS: Required<FormExtractionOptions> = {
  minConfidence: 0.3,
  maxHorizontalGapPt: 150,
  maxVerticalGapPt: 35,
};

const COMMON_FORM_KEYS = new Set([
  'name',
  'full name',
  'first name',
  'last name',
  'date',
  'invoice date',
  'due date',
  'order date',
  'invoice number',
  'invoice no',
  'inv no',
  'invoice #',
  'po number',
  'po #',
  'order number',
  'order #',
  'bill to',
  'ship to',
  'customer',
  'customer id',
  'account number',
  'account #',
  'terms',
  'subtotal',
  'tax',
  'total',
  'total amount',
  'balance due',
  'amount due',
  'phone',
  'telephone',
  'email',
  'address',
  'city',
  'state',
  'zip',
  'postal code',
  'country',
  'ssn',
  'tin',
  'ein',
  'signature',
]);

/**
 * Computes bounding box encompassing a list of boxes.
 */
function unionRects(rects: readonly PdfRect[]): PdfRect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  return {
    x: Math.round(minX * 100) / 100,
    y: Math.round(minY * 100) / 100,
    width: Math.round(Math.max(0, maxX - minX) * 100) / 100,
    height: Math.round(Math.max(0, maxY - minY) * 100) / 100,
  };
}

/**
 * Checks if a string likely acts as a form field key/label.
 */
function isPotentialKey(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  if (trimmed.endsWith(':')) return true;

  const normalized = trimmed.toLowerCase().replace(/[:#._-]/g, '').trim();
  return COMMON_FORM_KEYS.has(normalized);
}

/**
 * Extracts Key-Value pairs from a single OCR page result.
 */
export function extractPageKeyValuePairs(
  pageResult: OcrPageResult,
  options: FormExtractionOptions = {},
): OcrKeyValuePair[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const pairs: OcrKeyValuePair[] = [];
  const lines = pageResult.lines || [];
  const words = pageResult.words || [];
  const pageIndex = pageResult.pageIndex ?? 0;

  // Track lines that have already been assigned as values or keys
  const pairedLineIds = new Set<string>();

  // Map words by lineId for spatial bounding box construction
  const wordsByLineId = new Map<string, OcrWord[]>();
  for (const word of words) {
    if (word.lineId) {
      const list = wordsByLineId.get(word.lineId) || [];
      list.push(word);
      wordsByLineId.set(word.lineId, list);
    }
  }

  let pairCounter = 1;

  // Pass 1: Same-line colon separation (e.g. "Invoice Date: 2026-11-23")
  for (const line of lines) {
    if (line.confidence < opts.minConfidence) continue;

    const colonIdx = line.text.indexOf(':');
    if (colonIdx > 0 && colonIdx < line.text.length - 1) {
      const keyRaw = line.text.substring(0, colonIdx).trim();
      const valRaw = line.text.substring(colonIdx + 1).trim();

      if (keyRaw.length > 0 && valRaw.length > 0) {
        const lineWords = wordsByLineId.get(line.id) || [];
        const keyWords: OcrWord[] = [];
        const valWords: OcrWord[] = [];

        for (const w of lineWords) {
          const wText = w.text.trim();
          if (keyRaw.includes(wText) || line.text.indexOf(wText) <= colonIdx) {
            keyWords.push(w);
          } else {
            valWords.push(w);
          }
        }

        const keyBbox = keyWords.length > 0
          ? unionRects(keyWords.map((w) => w.bbox))
          : { ...line.bbox, width: line.bbox.width * (colonIdx / line.text.length) };

        const valBbox = valWords.length > 0
          ? unionRects(valWords.map((w) => w.bbox))
          : {
              ...line.bbox,
              x: line.bbox.x + line.bbox.width * (colonIdx / line.text.length),
              width: line.bbox.width * (1 - colonIdx / line.text.length),
            };

        pairs.push({
          id: `kv-${pageIndex}-${pairCounter++}`,
          pageIndex,
          keyText: keyRaw,
          keyBbox,
          valueText: valRaw,
          valueBbox: valBbox,
          confidence: line.confidence,
          layoutRelation: 'same-line-colon',
        });

        pairedLineIds.add(line.id);
      }
    }
  }

  // Pass 2: Standalone keys looking for adjacent right-of or below values
  for (const keyLine of lines) {
    if (pairedLineIds.has(keyLine.id)) continue;
    if (keyLine.confidence < opts.minConfidence) continue;

    if (!isPotentialKey(keyLine.text)) continue;

    const cleanKeyText = keyLine.text.replace(/:$/, '').trim();

    // Try Horizontal Right-of candidate
    let bestRightCandidate: OcrLine | null = null;
    let minHorizontalDistance = Number.POSITIVE_INFINITY;

    for (const cand of lines) {
      if (cand.id === keyLine.id || pairedLineIds.has(cand.id)) continue;
      if (cand.confidence < opts.minConfidence) continue;

      const deltaX = cand.bbox.x - (keyLine.bbox.x + keyLine.bbox.width);
      const verticalOverlap =
        Math.abs((cand.bbox.y + cand.bbox.height / 2) - (keyLine.bbox.y + keyLine.bbox.height / 2)) <=
        Math.max(keyLine.bbox.height, cand.bbox.height) * 0.75;

      if (deltaX >= -5 && deltaX <= opts.maxHorizontalGapPt && verticalOverlap) {
        if (deltaX < minHorizontalDistance) {
          minHorizontalDistance = deltaX;
          bestRightCandidate = cand;
        }
      }
    }

    if (bestRightCandidate) {
      pairedLineIds.add(keyLine.id);
      pairedLineIds.add(bestRightCandidate.id);
      pairs.push({
        id: `kv-${pageIndex}-${pairCounter++}`,
        pageIndex,
        keyText: cleanKeyText,
        keyBbox: keyLine.bbox,
        valueText: bestRightCandidate.text.trim(),
        valueBbox: bestRightCandidate.bbox,
        confidence: Math.round(((keyLine.confidence + bestRightCandidate.confidence) / 2) * 100) / 100,
        layoutRelation: 'right-of',
      });
      continue;
    }

    // Try Vertical Below candidate
    let bestBelowCandidate: OcrLine | null = null;
    let minVerticalDistance = Number.POSITIVE_INFINITY;

    for (const cand of lines) {
      if (cand.id === keyLine.id || pairedLineIds.has(cand.id)) continue;
      if (cand.confidence < opts.minConfidence) continue;

      const deltaY = cand.bbox.y - (keyLine.bbox.y + keyLine.bbox.height);
      const horizontalAlignment =
        Math.abs(cand.bbox.x - keyLine.bbox.x) <= 35 ||
        (cand.bbox.x >= keyLine.bbox.x - 10 && cand.bbox.x <= keyLine.bbox.x + keyLine.bbox.width + 10);

      if (deltaY >= -2 && deltaY <= opts.maxVerticalGapPt && horizontalAlignment) {
        if (deltaY < minVerticalDistance) {
          minVerticalDistance = deltaY;
          bestBelowCandidate = cand;
        }
      }
    }

    if (bestBelowCandidate) {
      pairedLineIds.add(keyLine.id);
      pairedLineIds.add(bestBelowCandidate.id);
      pairs.push({
        id: `kv-${pageIndex}-${pairCounter++}`,
        pageIndex,
        keyText: cleanKeyText,
        keyBbox: keyLine.bbox,
        valueText: bestBelowCandidate.text.trim(),
        valueBbox: bestBelowCandidate.bbox,
        confidence: Math.round(((keyLine.confidence + bestBelowCandidate.confidence) / 2) * 100) / 100,
        layoutRelation: 'below',
      });
    }
  }

  return pairs;
}

/**
 * Serializes extracted Key-Value pairs to a standard JSON dictionary.
 */
export function serializeKeyValuePairsToJson(pairs: readonly OcrKeyValuePair[]): string {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    result[pair.keyText] = pair.valueText;
  }
  return JSON.stringify(result, null, 2);
}

/**
 * Serializes extracted Key-Value pairs to CSV format.
 */
export function serializeKeyValuePairsToCsv(pairs: readonly OcrKeyValuePair[]): string {
  const rows: string[] = ['"Key","Value","Confidence","LayoutRelation","PageIndex"'];
  for (const p of pairs) {
    const escapedKey = p.keyText.replace(/"/g, '""');
    const escapedVal = p.valueText.replace(/"/g, '""');
    rows.push(`"${escapedKey}","${escapedVal}",${p.confidence},"${p.layoutRelation}",${p.pageIndex}`);
  }
  return rows.join('\n');
}
