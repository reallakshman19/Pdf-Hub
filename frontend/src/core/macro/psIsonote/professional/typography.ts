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

/**
 * Wraps text deterministically based on maximum box width and font metrics.
 */
export function wrapTextMetric(text: string, maxLineWidth: number, fontSize: number): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxLineWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
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
  const tagLine = `Tag: ${tag}`;
  
  let noteText = `ISO Note: ${note}`;
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
