/**
 * Automated PII (Personally Identifiable Information) and Sensitive Entity Detector.
 *
 * Scans recognized text streams across OCR pages for SSNs, emails, phone numbers,
 * credit cards, tax IDs, and IP addresses, and maps matches to spatial bounding boxes.
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain logic, no console.log.
 */

import type { OcrPageResult, OcrLine, OcrWord, PdfRect } from '../types';
import type { OcrPiiEntity, PiiCategory } from './formTypes';

export interface PiiDetectionRule {
  category: PiiCategory;
  pattern: RegExp;
  mask: (match: string) => string;
  validate?: (match: string) => boolean;
}

/**
 * Validates credit card number with Luhn algorithm.
 */
function isValidLuhn(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number.parseInt(digits[i], 10);
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const DEFAULT_PII_RULES: readonly PiiDetectionRule[] = [
  {
    category: 'ssn',
    pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
    mask: (val) => {
      const last4 = val.slice(-4);
      return `***-**-${last4}`;
    },
  },
  {
    category: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    mask: (val) => {
      const parts = val.split('@');
      const name = parts[0] || '';
      const domain = parts[1] || '';
      return `${name.charAt(0)}***@${domain}`;
    },
  },
  {
    category: 'phone',
    pattern: /(?:(?:\+?1[-. ]?)?\(?[0-9]{3}\)?[-. ]?[0-9]{3}[-. ][0-9]{4})\b/g,
    mask: (val) => {
      const digits = val.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `(***) ***-${last4}`;
    },
  },
  {
    category: 'credit-card',
    pattern: /\b(?:\d{4}[- ]){3}\d{4}\b|\b\d{16}\b/g,
    validate: (val) => isValidLuhn(val),
    mask: (val) => {
      const digits = val.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `****-****-****-${last4}`;
    },
  },
  {
    category: 'tax-id',
    pattern: /\b\d{2}-\d{7}\b/g,
    mask: (val) => {
      const last4 = val.slice(-4);
      return `**-***${last4}`;
    },
  },
  {
    category: 'ip-address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    mask: () => '***.***.***.***',
  },
];

/**
 * Computes union bounding box for matching words in a line.
 */
function findBoundingBoxForRange(
  line: OcrLine,
  words: readonly OcrWord[],
  startChar: number,
  endChar: number,
): PdfRect {
  const lineWords = words.filter((w) => w.lineId === line.id);
  if (lineWords.length === 0) {
    // Proportional fallback from line bbox
    const totalChars = Math.max(line.text.length, 1);
    const charWidth = line.bbox.width / totalChars;
    return {
      x: line.bbox.x + startChar * charWidth,
      y: line.bbox.y,
      width: Math.max(10, (endChar - startChar) * charWidth),
      height: line.bbox.height,
    };
  }

  // Find words overlapping character range
  const matchedWords: OcrWord[] = [];
  let currentPos = 0;

  for (const w of lineWords) {
    const wordStart = line.text.indexOf(w.text, currentPos);
    if (wordStart === -1) continue;
    const wordEnd = wordStart + w.text.length;
    currentPos = wordEnd;

    // Overlaps with [startChar, endChar]
    if (Math.max(startChar, wordStart) < Math.min(endChar, wordEnd)) {
      matchedWords.push(w);
    }
  }

  if (matchedWords.length === 0) {
    return line.bbox;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const w of matchedWords) {
    minX = Math.min(minX, w.bbox.x);
    minY = Math.min(minY, w.bbox.y);
    maxX = Math.max(maxX, w.bbox.x + w.bbox.width);
    maxY = Math.max(maxY, w.bbox.y + w.bbox.height);
  }

  return {
    x: Math.round(minX * 100) / 100,
    y: Math.round(minY * 100) / 100,
    width: Math.round(Math.max(10, maxX - minX) * 100) / 100,
    height: Math.round(Math.max(10, maxY - minY) * 100) / 100,
  };
}

/**
 * Detects all sensitive PII entities in a page OCR result.
 */
export function detectPagePiiEntities(
  pageResult: OcrPageResult,
  customRules: readonly PiiDetectionRule[] = [],
): OcrPiiEntity[] {
  const entities: OcrPiiEntity[] = [];
  const lines = pageResult.lines || [];
  const words = pageResult.words || [];
  const pageIndex = pageResult.pageIndex ?? 0;
  const rules = [...DEFAULT_PII_RULES, ...customRules];

  let counter = 1;

  for (const line of lines) {
    for (const rule of rules) {
      // Reset stateful regexes
      rule.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line.text)) !== null) {
        const rawText = match[0];
        const startChar = match.index;
        const endChar = startChar + rawText.length;

        // Optional custom validator (e.g. Luhn for credit cards)
        if (rule.validate && !rule.validate(rawText)) {
          continue;
        }

        const bbox = findBoundingBoxForRange(line, words, startChar, endChar);
        const maskedText = rule.mask(rawText);

        entities.push({
          id: `pii-${pageIndex}-${counter++}`,
          pageIndex,
          category: rule.category,
          rawText,
          maskedText,
          bbox,
          confidence: line.confidence,
        });
      }
    }
  }

  return entities;
}
