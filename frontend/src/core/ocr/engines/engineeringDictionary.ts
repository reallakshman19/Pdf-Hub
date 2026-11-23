import type { TesseractRecognizeData, TesseractTextNode } from './tesseractJsEngine';

/**
 * Engineering unit patterns and regex replacement rules.
 * Conservative transformations that fix OCR character misrecognitions
 * on engineering drawings and technical schematics.
 */

// Common engineering units following numbers:
// 1. BAR: '8AR', '8ar', 'Bar' -> 'BAR' when preceded by a number or space+number
const UNIT_BAR_REGEX = /\b(\d+(?:\.\d+)?)\s*(?:8AR|8ar|bar|Bar)\b/g;

// 2. PSI: 'P51', 'p51', 'Psi', 'psi' -> 'PSI' when preceded by a number
const UNIT_PSI_REGEX = /\b(\d+(?:\.\d+)?)\s*(?:P51|p51|Psi|psi)\b/g;

// 3. kPa / MPa: 'kpa', 'KPA', 'mpa', 'MPA'
const UNIT_PRESSURE_METRIC_REGEX = /\b(\d+(?:\.\d+)?)\s*(?:kpa|Kpa|KPA)\b/g;
const UNIT_MPA_REGEX = /\b(\d+(?:\.\d+)?)\s*(?:mpa|Mpa|MPA)\b/g;

// 4. Diameter symbol: 'O' or '0' followed by numbers in dimension context (e.g. 'O25', 'O 25')
const DIAMETER_O_REGEX = /(?:^|\s)[O0](\d{1,4}(?:\.\d+)?)\b/g;

// 5. Tolerance: '+-' or '=/' followed by number -> '±'
const PLUS_MINUS_REGEX = /(?:\+-|=\/)\s*(\d+(?:\.\d+)?)/g;

// 6. Metric units: 'mrn' -> 'mm'
const MM_MISREAD_REGEX = /\b(\d+(?:\.\d+)?)\s*(?:mrn|rnm|mım)\b/g;

// Known technical engineering words dictionary for exact case normalization
export const KNOWN_ENGINEERING_TERMS: Record<string, string> = {
  'VALVE': 'VALVE',
  'VALV': 'VALVE',
  'PUMP': 'PUMP',
  'GAUGE': 'GAUGE',
  'COMPRESSOR': 'COMPRESSOR',
  'SECTION': 'SECTION',
  'DETAIL': 'DETAIL',
  'ELEVATION': 'ELEVATION',
  'ANCHOR': 'ANCHOR',
  'FLANGE': 'FLANGE',
  'GASKET': 'GASKET',
  'SCHEDULE': 'SCHEDULE',
  'SPEC': 'SPEC',
  'REV': 'REV',
  'DWG': 'DWG',
};

/**
 * Applies engineering lexicon and symbol corrections to a text string.
 */
export function correctEngineeringText(text: string): string {
  if (!text || text.length === 0) return text;

  let result = text;

  // Pressure: 10 8AR -> 10 BAR
  result = result.replace(UNIT_BAR_REGEX, '$1 BAR');

  // Pressure: 25 P51 -> 25 PSI
  result = result.replace(UNIT_PSI_REGEX, '$1 PSI');

  // Metric pressure: 100 kpa -> 100 kPa
  result = result.replace(UNIT_PRESSURE_METRIC_REGEX, '$1 kPa');
  result = result.replace(UNIT_MPA_REGEX, '$1 MPa');

  // Metric length: 50 mrn -> 50 mm
  result = result.replace(MM_MISREAD_REGEX, '$1 mm');

  // Tolerance: +-0.05 -> ±0.05
  result = result.replace(PLUS_MINUS_REGEX, '±$1');

  // Diameter: O25 -> Ø25
  result = result.replace(DIAMETER_O_REGEX, (match, digits: string) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    return `${prefix}Ø${digits}`;
  });

  // Isolated misspelled engineering terms
  const tokens = result.split(/(\s+)/);
  const correctedTokens = tokens.map((token) => {
    const upper = token.toUpperCase();
    if (upper === '8AR') return 'BAR';
    if (upper === 'P51') return 'PSI';

    if (KNOWN_ENGINEERING_TERMS[upper] && upper === token) {
      return KNOWN_ENGINEERING_TERMS[upper];
    }
    // Simple 1-char edit distance match for all-caps words of length >= 4
    if (/^[A-Z]{4,12}$/.test(token)) {
      if (token === 'VALV') return 'VALVE';
      if (token === 'CONPRESSOR') return 'COMPRESSOR';
      if (token === 'FLANQE') return 'FLANGE';
    }
    return token;
  });

  return correctedTokens.join('');
}

/**
 * Recursively applies engineering corrections to a Tesseract node tree.
 */
function correctNode(node: TesseractTextNode): TesseractTextNode {
  const correctedText = node.text ? correctEngineeringText(node.text) : node.text;

  const correctedWords = node.words ? node.words.map(correctNode) : undefined;
  const correctedLines = node.lines ? node.lines.map(correctNode) : undefined;
  const correctedParagraphs = node.paragraphs ? node.paragraphs.map(correctNode) : undefined;
  const correctedBlocks = node.blocks ? node.blocks.map(correctNode) : undefined;

  return {
    ...node,
    text: correctedText,
    words: correctedWords,
    lines: correctedLines,
    paragraphs: correctedParagraphs,
    blocks: correctedBlocks,
  };
}

/**
 * Applies engineering dictionary and unit corrections to Tesseract recognized data.
 */
export function applyEngineeringDictionaryToTesseractData(
  data: TesseractRecognizeData,
): TesseractRecognizeData {
  const correctedText = data.text ? correctEngineeringText(data.text) : data.text;

  const correctedWords = data.words ? data.words.map(correctNode) : undefined;
  const correctedLines = data.lines ? data.lines.map(correctNode) : undefined;
  const correctedParagraphs = data.paragraphs ? data.paragraphs.map(correctNode) : undefined;
  const correctedBlocks = data.blocks ? data.blocks.map(correctNode) : undefined;

  return {
    ...data,
    text: correctedText,
    words: correctedWords,
    lines: correctedLines,
    paragraphs: correctedParagraphs,
    blocks: correctedBlocks,
  };
}
