/**
 * Deterministic typography module for professional vector callout core.
 * Provides metric-based text wrapping and accurate box height computation without browser DOM dependence.
 */

// Approximate proportional width ratio relative to font size for standard Helvetica/Arial glyphs
const DEFAULT_CHAR_ASPECT_RATIO = 0.56;

export function estimateTextWidth(text: string, fontSize: number): number {
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    // Narrow characters
    if ('il1j!.,:;|'.includes(ch)) {
      total += fontSize * 0.32;
    } else if ('WM@%'.includes(ch)) {
      // Wide characters
      total += fontSize * 0.82;
    } else if (ch >= 'A' && ch <= 'Z') {
      total += fontSize * 0.68;
    } else {
      total += fontSize * DEFAULT_CHAR_ASPECT_RATIO;
    }
  }
  return total;
}

export interface TextMetricsProvider {
  widthOfText(
    text: string,
    fontSize: number,
    weight?: 'normal' | 'bold',
  ): number;
}

export class DefaultTextMetricsProvider implements TextMetricsProvider {
  widthOfText(text: string, fontSize: number): number {
    return estimateTextWidth(text, fontSize);
  }
}

export const defaultMetricsProvider = new DefaultTextMetricsProvider();

function breakLongToken(
  token: string,
  maxLineWidth: number,
  fontSize: number,
  provider: TextMetricsProvider,
): string[] {
  const chars = Array.from(token);
  const result: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (provider.widthOfText(ch, fontSize, 'normal') > maxLineWidth) {
      throw new Error(`Available line width (${maxLineWidth}) is too narrow to fit character '${ch}'.`);
    }

    const candidate = current + ch;
    if (provider.widthOfText(candidate, fontSize, 'normal') <= maxLineWidth) {
      current = candidate;
    } else {
      let splitIdx = -1;
      const semanticChars = ['/', '-', '_', '.', ':'];
      for (let j = current.length - 1; j > 0; j -= 1) {
        if (semanticChars.includes(current[j])) {
          splitIdx = j + 1;
          break;
        }
      }

      if (splitIdx > 0 && splitIdx < current.length) {
        result.push(current.slice(0, splitIdx));
        current = current.slice(splitIdx);
        if (provider.widthOfText(current + ch, fontSize, 'normal') <= maxLineWidth) {
          current += ch;
        } else {
          result.push(current);
          current = ch;
        }
      } else {
        result.push(current);
        current = ch;
      }
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

/**
 * Wraps text deterministically based on maximum box width and font metrics.
 */
export function wrapTextMetric(
  text: string,
  maxLineWidth: number,
  fontSize: number,
  provider: TextMetricsProvider = defaultMetricsProvider,
): string[] {
  if (!text) return [];
  if (maxLineWidth <= 0) {
    throw new Error('maxLineWidth must be positive.');
  }

  if (provider.widthOfText('i', fontSize, 'normal') > maxLineWidth) {
    throw new Error(`Available line width (${maxLineWidth}) is too narrow to fit even one glyph.`);
  }

  const explicitLines = text.split('\n');
  const lines: string[] = [];

  for (const explicitLine of explicitLines) {
    if (explicitLine === '') {
      lines.push('');
      continue;
    }

    const words = explicitLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (provider.widthOfText(word, fontSize, 'normal') > maxLineWidth) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        const brokenTokens = breakLongToken(word, maxLineWidth, fontSize, provider);
        for (let i = 0; i < brokenTokens.length - 1; i += 1) {
          lines.push(brokenTokens[i]);
        }
        currentLine = brokenTokens[brokenTokens.length - 1] ?? '';
        continue;
      }

      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (provider.widthOfText(candidate, fontSize, 'normal') <= maxLineWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  for (const line of lines) {
    if (provider.widthOfText(line, fontSize, 'normal') > maxLineWidth) {
      throw new Error(`Line "${line}" width exceeds maxLineWidth (${maxLineWidth}).`);
    }
  }

  return lines;
}

export interface BoxDimensions {
  width: number;
  height: number;
  tagLine: string;
  noteLines: string[];
  lineHeight: number;
  padding: number;
}

/**
 * Calculates exact callout box dimensions deterministically from font metrics and text content.
 */
export function calculateCalloutBoxDimensions(
  tag: string,
  note: string,
  confidence: string,
  boxWidth = 200,
  fontSize = 9,
  padding = 8,
): BoxDimensions {
  const usableWidth = Math.max(50, boxWidth - padding * 2);
  const tagLine = tag.startsWith('Tag: ') ? tag : `Tag: ${tag}`;
  
  let noteText = note.startsWith('ISO Note: ') ? note : `ISO Note: ${note}`;
  if (confidence && !noteText.includes(`(C=`)) {
    const c = confidence.trim().toUpperCase();
    const code = c.includes('HIGH') || c.startsWith('H') ? 'H' :
                 c.includes('MEDIUM') || c.startsWith('M') ? 'M' :
                 c.includes('LOW') || c.startsWith('L') ? 'L' :
                 c.charAt(0);
    if (code) {
      noteText += ` (C=${code})`;
    }
  }

  const noteLines = wrapTextMetric(noteText, usableWidth, fontSize);
  const lineHeight = fontSize * 1.35;
  
  // Total height = padding (top) + tagLine + space (3px) + noteLines + padding (bottom)
  const totalLines = 1 + noteLines.length;
  const height = Math.ceil(padding * 2 + totalLines * lineHeight + 4);
  
  return {
    width: boxWidth,
    height,
    tagLine,
    noteLines,
    lineHeight,
    padding,
  };
}
