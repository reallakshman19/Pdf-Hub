import type {
  CalloutConfidence,
  ConfidenceCode,
  ProfessionalCalloutContent,
  StyleContract,
} from './model';

const DEFAULT_GLYPH_RATIO = 0.56;
const SPACE_GLYPH_RATIO = 0.28;
const NARROW_GLYPHS = 'il1j!.,:;|';
const WIDE_GLYPHS = 'WM@%';
const TRAILING_HARD_BREAK = /(?:\r\n|\r|\n)$/u;
const TRAILING_CONFIDENCE = /\s*\(\s*C\s*=\s*[^)]+\)\s*$/iu;
const CONFIDENCE_CODES: Readonly<Record<CalloutConfidence, ConfidenceCode>> = {
  HIGH: 'H',
  MEDIUM: 'M',
  LOW: 'L',
};

export interface CalloutPresentation {
  readonly tagText?: string;
  readonly noteText?: string;
}

export interface BoxDimensions {
  readonly width: number;
  readonly height: number;
  readonly usableWidth: number;
  readonly tagLines: readonly string[];
  readonly noteLines: readonly string[];
  readonly lineHeight: number;
  readonly padding: number;
  readonly sectionGap: number;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function glyphWidthRatio(glyph: string): number {
  if (glyph === '\n' || glyph === '\r') return 0;
  if (glyph === '\t') return SPACE_GLYPH_RATIO * 4;
  if (/\s/u.test(glyph)) return SPACE_GLYPH_RATIO;
  if (NARROW_GLYPHS.includes(glyph)) return 0.32;
  if (WIDE_GLYPHS.includes(glyph)) return 0.82;
  if (glyph >= 'A' && glyph <= 'Z') return 0.68;
  return DEFAULT_GLYPH_RATIO;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  assertPositiveFinite(fontSize, 'fontSize');
  return Array.from(text).reduce(
    (total, glyph) => total + fontSize * glyphWidthRatio(glyph),
    0,
  );
}

function isHardBreak(glyph: string): boolean {
  return glyph === '\n' || glyph === '\r';
}

function findBreakPoint(
  glyphs: readonly string[],
  maxLineWidth: number,
  fontSize: number,
): number {
  let fittedCount = 0;
  let lastWhitespaceBreak = 0;
  let width = 0;

  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    if (glyph === undefined) break;
    const nextWidth = width + estimateTextWidth(glyph, fontSize);
    if (nextWidth > maxLineWidth) break;
    width = nextWidth;
    fittedCount = index + 1;
    if (isHardBreak(glyph)) {
      return glyph === '\r' && glyphs[index + 1] === '\n'
        ? fittedCount + 1
        : fittedCount;
    }
    if (/\s/u.test(glyph)) lastWhitespaceBreak = fittedCount;
  }

  if (fittedCount === glyphs.length) return fittedCount;
  if (fittedCount === 0) {
    throw new RangeError('maxLineWidth cannot fit the next Unicode code point.');
  }
  return lastWhitespaceBreak || fittedCount;
}

export function wrapTextMetric(
  text: string,
  maxLineWidth: number,
  fontSize: number,
): readonly string[] {
  assertPositiveFinite(maxLineWidth, 'maxLineWidth');
  assertPositiveFinite(fontSize, 'fontSize');
  const remaining = Array.from(text);
  const lines: string[] = [];

  while (remaining.length > 0) {
    const breakPoint = findBreakPoint(remaining, maxLineWidth, fontSize);
    lines.push(remaining.splice(0, breakPoint).join(''));
  }
  return lines;
}

export function formatConfidenceCode(confidence: CalloutConfidence): ConfidenceCode {
  return CONFIDENCE_CODES[confidence];
}

function normalizeSemanticValue(
  value: string | undefined,
  prefix: string,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new Error(`${field} must not include the presentation prefix "${prefix}".`);
  }
  return normalized;
}

function assertConfidenceOwnership(
  note: string | undefined,
  confidence: CalloutConfidence | undefined,
): void {
  if (note && confidence && TRAILING_CONFIDENCE.test(note)) {
    throw new Error(
      'isoNoteValue must not include a confidence suffix when confidence is provided.',
    );
  }
}

export function formatCalloutPresentation(
  content: ProfessionalCalloutContent,
): CalloutPresentation {
  const tagPrefix = 'Tag:';
  const notePrefix = 'ISO Note:';
  const tagValue = normalizeSemanticValue(content.tagValue, tagPrefix, 'tagValue');
  const noteValue = normalizeSemanticValue(content.isoNoteValue, notePrefix, 'isoNoteValue');
  assertConfidenceOwnership(noteValue, content.confidence);

  const tagText = tagValue ? `${tagPrefix} ${tagValue}` : undefined;
  const confidenceSuffix = content.confidence
    ? ` (C=${formatConfidenceCode(content.confidence)})`
    : '';
  const noteText = noteValue
    ? `${notePrefix} ${noteValue}${confidenceSuffix}`
    : undefined;

  return {
    ...(tagText ? { tagText } : {}),
    ...(noteText ? { noteText } : {}),
  };
}

function toRenderableLine(line: string): string {
  return line.replace(TRAILING_HARD_BREAK, '');
}

function wrapOptionalText(
  text: string | undefined,
  usableWidth: number,
  fontSize: number,
): readonly string[] {
  return text === undefined
    ? []
    : wrapTextMetric(text, usableWidth, fontSize).map(toRenderableLine);
}

export function calculateCalloutBoxDimensions(
  content: ProfessionalCalloutContent,
  boxWidth: number,
  style: StyleContract,
): BoxDimensions {
  assertPositiveFinite(boxWidth, 'boxWidth');
  const usableWidth = boxWidth - style.padding * 2;
  if (usableWidth <= 0) {
    throw new RangeError('boxWidth must exceed twice the callout padding.');
  }

  const presentation = formatCalloutPresentation(content);
  const tagLines = wrapOptionalText(presentation.tagText, usableWidth, style.fontSize);
  const noteLines = wrapOptionalText(presentation.noteText, usableWidth, style.fontSize);
  const totalLines = tagLines.length + noteLines.length;
  const sectionGap = tagLines.length > 0 && noteLines.length > 0 ? style.sectionGap : 0;
  const height = Math.ceil(
    style.padding * 2 + totalLines * style.lineHeight + sectionGap,
  );

  return {
    width: boxWidth,
    height,
    usableWidth,
    tagLines,
    noteLines,
    lineHeight: style.lineHeight,
    padding: style.padding,
    sectionGap,
  };
}
