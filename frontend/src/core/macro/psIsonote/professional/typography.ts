import type { TextMetricsProvider } from './model';

export interface WrappedTextLine {
  text: string;
  width: number;
}

export interface CalloutTypographyLayout {
  headerLine: WrappedTextLine;
  familyLine?: WrappedTextLine;
  statusLine?: WrappedTextLine;
  noteLines: WrappedTextLine[];
  height: number;
}

function normalizeVisibleText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function splitLongToken(
  token: string,
  maximumWidth: number,
  fontSize: number,
  weight: 'regular' | 'bold',
  metrics: TextMetricsProvider,
): string[] {
  if (metrics.widthOfText(token, fontSize, weight) <= maximumWidth) return [token];

  const chunks: string[] = [];
  let current = '';

  for (const character of token) {
    const candidate = current + character;
    if (current && metrics.widthOfText(candidate, fontSize, weight) > maximumWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function wrapTextByMetrics(options: {
  text: string;
  maximumWidth: number;
  fontSize: number;
  weight?: 'regular' | 'bold';
  metrics: TextMetricsProvider;
}): WrappedTextLine[] {
  const weight = options.weight ?? 'regular';
  const normalized = normalizeVisibleText(options.text);
  if (!normalized) return [];

  const tokens = normalized
    .split(' ')
    .flatMap((token) => splitLongToken(
      token,
      options.maximumWidth,
      options.fontSize,
      weight,
      options.metrics,
    ));

  const lines: WrappedTextLine[] = [];
  let current = '';

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    const candidateWidth = options.metrics.widthOfText(candidate, options.fontSize, weight);

    if (current && candidateWidth > options.maximumWidth) {
      lines.push({
        text: current,
        width: options.metrics.widthOfText(current, options.fontSize, weight),
      });
      current = token;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push({
      text: current,
      width: options.metrics.widthOfText(current, options.fontSize, weight),
    });
  }

  return lines;
}

export function layoutCalloutTypography(options: {
  psNo: string;
  isonote: string;
  family?: string;
  statusLabel?: string;
  width: number;
  paddingX: number;
  paddingY: number;
  headerFontSize: number;
  noteFontSize: number;
  secondaryFontSize: number;
  lineHeight: number;
  metrics: TextMetricsProvider;
}): CalloutTypographyLayout {
  const usableWidth = Math.max(20, options.width - options.paddingX * 2);
  const headerText = normalizeVisibleText(options.psNo);
  const headerLine = {
    text: headerText,
    width: options.metrics.widthOfText(headerText, options.headerFontSize, 'bold'),
  };
  const familyText = options.family ? normalizeVisibleText(options.family) : '';
  const statusText = options.statusLabel ? normalizeVisibleText(options.statusLabel) : '';
  const familyLine = familyText
    ? {
        text: familyText,
        width: options.metrics.widthOfText(familyText, options.secondaryFontSize, 'regular'),
      }
    : undefined;
  const statusLine = statusText
    ? {
        text: statusText,
        width: options.metrics.widthOfText(statusText, options.secondaryFontSize, 'bold'),
      }
    : undefined;
  const noteLines = wrapTextByMetrics({
    text: options.isonote,
    maximumWidth: usableWidth,
    fontSize: options.noteFontSize,
    metrics: options.metrics,
  });

  const headerHeight = options.headerFontSize * options.lineHeight;
  const secondaryHeight = (familyLine || statusLine)
    ? options.secondaryFontSize * options.lineHeight
    : 0;
  const noteHeight = Math.max(1, noteLines.length) * options.noteFontSize * options.lineHeight;
  const sectionGap = options.noteFontSize * 0.45;

  return {
    headerLine,
    ...(familyLine ? { familyLine } : {}),
    ...(statusLine ? { statusLine } : {}),
    noteLines,
    height: Math.ceil(
      options.paddingY * 2 +
      headerHeight +
      secondaryHeight +
      sectionGap +
      noteHeight,
    ),
  };
}
