import type { OcrWord, OcrCorrection } from '@/core/ocr/types';
import { isWordLowConfidence } from '@/components/ocr/canvas/ocrCanvasCoordinateAdapter';
import { KNOWN_ENGINEERING_TERMS, correctEngineeringText } from '@/core/ocr/engines/engineeringDictionary';

/**
 * Finds the index of the next low-confidence uncorrected word starting after `currentIndex`.
 * Wraps around to beginning if reached the end.
 */
export function findNextLowConfidenceWordIndex(
  words: OcrWord[],
  currentIndex: number,
  correctionsByTargetId?: Map<string, OcrCorrection>,
  threshold: number = 0.75,
): number {
  if (words.length === 0) return -1;

  for (let i = 1; i <= words.length; i++) {
    const idx = (currentIndex + i) % words.length;
    if (isWordLowConfidence(words[idx], correctionsByTargetId, threshold)) {
      return idx;
    }
  }

  return -1;
}

/**
 * Finds the index of the previous low-confidence uncorrected word starting before `currentIndex`.
 * Wraps around to end if reached the beginning.
 */
export function findPreviousLowConfidenceWordIndex(
  words: OcrWord[],
  currentIndex: number,
  correctionsByTargetId?: Map<string, OcrCorrection>,
  threshold: number = 0.75,
): number {
  if (words.length === 0) return -1;

  for (let i = 1; i <= words.length; i++) {
    const idx = (currentIndex - i + words.length) % words.length;
    if (isWordLowConfidence(words[idx], correctionsByTargetId, threshold)) {
      return idx;
    }
  }

  return -1;
}

/**
 * Generates smart OCR correction suggestions based on common character confusion
 * (e.g., 0/O, 1/I/l, 5/S, 8/B) and matching engineering dictionary entries.
 */
export function generateOcrSuggestions(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  const raw = text.trim();
  const upper = raw.toUpperCase();
  const suggestions = new Set<string>();

  // 1. Rule-based engineering correction
  const ruleCorrected = correctEngineeringText(raw);
  if (ruleCorrected && ruleCorrected !== raw) {
    suggestions.add(ruleCorrected);
  }

  // 2. Engineering dictionary matches
  if (KNOWN_ENGINEERING_TERMS) {
    Object.values(KNOWN_ENGINEERING_TERMS).forEach((dictWord) => {
      if (dictWord === upper) return;
      if (dictWord.length === upper.length && levenshteinDistance(dictWord, upper) <= 2) {
        suggestions.add(dictWord);
      }
    });
  }

  // 3. OCR Character Confusion permutations
  const confusions: Array<[RegExp, (match: string) => string]> = [
    [/[0O]/g, (match) => (match === '0' ? 'O' : '0')],
    [/[1Il|]/g, () => 'I'],
    [/5/g, () => 'S'],
    [/S/g, () => '5'],
    [/8/g, () => 'B'],
    [/B/g, () => '8'],
    [/rn/g, () => 'm'],
    [/vv/g, () => 'w'],
  ];

  confusions.forEach(([pattern, replacer]) => {
    if (pattern.test(raw)) {
      const swapped = raw.replace(pattern, replacer);
      if (swapped !== raw) {
        suggestions.add(swapped);
      }
    }
  });

  // Limit to top 4 distinct suggestions
  return Array.from(suggestions).slice(0, 4);
}

/**
 * Simple Levenshtein distance helper for dictionary proximity.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
