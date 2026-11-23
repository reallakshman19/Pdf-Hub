/**
 * Tesseract Page Segmentation Mode (PSM) heuristics and multi-pass fallback strategy.
 * Strictly adheres to Tesseract.js engine options and prevents missegmentation on
 * CAD drawings, single-line labels, and tabular regions.
 */

export const TESSERACT_PSM = {
  OSD_ONLY: '0',
  AUTO_OSD: '1',
  AUTO_ONLY: '2',
  AUTO: '3',
  SINGLE_COLUMN: '4',
  SINGLE_VERTICAL_BLOCK: '5',
  SINGLE_BLOCK: '6',
  SINGLE_LINE: '7',
  SINGLE_WORD: '8',
  CIRCLE_WORD: '9',
  SINGLE_CHAR: '10',
  SPARSE_TEXT: '11',
  SPARSE_TEXT_OSD: '12',
  RAW_LINE: '13',
} as const;

export type TesseractPsmMode = (typeof TESSERACT_PSM)[keyof typeof TESSERACT_PSM];

export interface DeterminePsmInput {
  isRegionCrop?: boolean;
  width: number;
  height: number;
  profileId?: string;
  userPreferredPsm?: string;
}

/**
 * Determines the optimal primary PSM mode based on geometry and document intent.
 */
export function determinePrimaryPsm(input: DeterminePsmInput): string {
  if (input.userPreferredPsm) {
    return input.userPreferredPsm;
  }

  if (input.isRegionCrop) {
    const aspectRatio = input.height > 0 ? input.width / input.height : 1;

    // Small compact crop likely containing a single word or symbol (e.g. tag, number)
    if (input.width <= 75 && input.height <= 30) {
      return TESSERACT_PSM.SINGLE_WORD; // '8'
    }

    // Single-line crops: wide horizontal rectangle with short height (e.g. tag label, header)
    if (aspectRatio >= 2.5 && input.height <= 45) {
      return TESSERACT_PSM.SINGLE_LINE; // '7'
    }

    // Default for general region crops: AUTO (PSM 3) provides robust automatic
    // layout analysis and segmentation for rotated, tabular, or multi-line crops
    // without forcing uniform horizontal scanlines.
    return TESSERACT_PSM.AUTO; // '3'
  }

  if (
    input.profileId === 'cad-drawing'
    || input.profileId === 'engineering-cad'
    || input.profileId === 'sparse-layout'
  ) {
    return TESSERACT_PSM.SPARSE_TEXT; // '11'
  }

  // Default for full multi-column/standard documents
  return TESSERACT_PSM.AUTO; // '3'
}

export interface ShouldTriggerMultiPassInput {
  wordsCount: number;
  averageConfidence: number;
  primaryPsm: string;
  multiPassEnabled?: boolean;
}

/**
 * Evaluates whether recognition quality was sufficiently degraded to justify a fallback pass.
 */
export function shouldTriggerMultiPass(input: ShouldTriggerMultiPassInput): boolean {
  if (!input.multiPassEnabled) {
    return false;
  }

  // Empty words detected
  if (input.wordsCount === 0) {
    return true;
  }

  // Low confidence: trigger fallback if average confidence is below 60%
  if (input.averageConfidence < 60) {
    return true;
  }

  return false;
}

/**
 * Returns the candidate fallback PSM mode to test if the primary mode underperforms.
 */
export function determineFallbackPsm(primaryPsm: string, isRegionCrop = false): string {
  if (isRegionCrop) {
    if (primaryPsm === TESSERACT_PSM.SINGLE_WORD) {
      return TESSERACT_PSM.SINGLE_LINE; // '7'
    }
    if (primaryPsm === TESSERACT_PSM.SINGLE_LINE) {
      return TESSERACT_PSM.AUTO; // '3'
    }
    if (primaryPsm === TESSERACT_PSM.AUTO) {
      return TESSERACT_PSM.SINGLE_BLOCK; // '6'
    }
    return TESSERACT_PSM.AUTO; // '3'
  }

  switch (primaryPsm) {
    case TESSERACT_PSM.AUTO: // '3'
      return TESSERACT_PSM.SPARSE_TEXT; // '11' (try finding disconnected text/labels)
    case TESSERACT_PSM.SPARSE_TEXT: // '11'
      return TESSERACT_PSM.AUTO; // '3'
    case TESSERACT_PSM.SINGLE_BLOCK: // '6'
      return TESSERACT_PSM.AUTO; // '3'
    default:
      return TESSERACT_PSM.AUTO; // '3'
  }
}

export interface RecognitionPassSummary {
  wordsCount: number;
  averageConfidence: number;
  text?: string;
}

/**
 * Selects the better recognition result between primary and fallback passes.
 */
export function selectBestRecognitionPass(
  passA: RecognitionPassSummary,
  passB: RecognitionPassSummary,
): 'A' | 'B' {
  if (passA.wordsCount === 0 && passB.wordsCount > 0) return 'B';
  if (passB.wordsCount === 0 && passA.wordsCount > 0) return 'A';

  // Composite score: weighted product of confidence and information volume
  const scoreA = passA.averageConfidence * Math.log2(passA.wordsCount + 1);
  const scoreB = passB.averageConfidence * Math.log2(passB.wordsCount + 1);

  return scoreB > scoreA ? 'B' : 'A';
}
