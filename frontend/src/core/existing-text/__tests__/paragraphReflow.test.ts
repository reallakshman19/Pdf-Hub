import { describe, it, expect } from 'vitest';
import {
  clusterPageSpansIntoParagraphs,
  findParagraphForSpan,
} from '../paragraphClusterer';
import {
  reflowParagraphText,
  defaultApproximateTextWidth,
} from '../paragraphReflowEngine';
import { buildExistingTextSpan } from '../model';

function makeSpan(
  sourceIndex: number,
  text: string,
  x: number,
  y: number,
  fontSize: number = 12,
  fontName: string = 'Helvetica',
) {
  return buildExistingTextSpan(
    { revisionId: 'rev-1', pageId: 'p-1', pageIndex: 0 },
    {
      sourceIndex,
      text,
      transform: [fontSize, 0, 0, fontSize, x, y],
      width: text.length * fontSize * 0.5,
      height: fontSize,
      fontName,
      direction: 'ltr',
      hasEol: false,
    },
  );
}

describe('Paragraph Clusterer', () => {
  it('clusters vertically stacked spans with uniform font and leading into a single paragraph block', () => {
    // 3 lines spaced 14pt apart vertically (y = 700, 686, 672)
    const span1 = makeSpan(0, 'First line of the paragraph.', 72, 700, 12);
    const span2 = makeSpan(1, 'Second line continues here.', 72, 686, 12);
    const span3 = makeSpan(2, 'Third and final sentence.', 72, 672, 12);

    const paragraphs = clusterPageSpansIntoParagraphs([span1, span2, span3]);

    expect(paragraphs).toHaveLength(1);
    const p = paragraphs[0];
    expect(p.lines).toHaveLength(3);
    expect(p.lines[0].text).toBe('First line of the paragraph.');
    expect(p.lines[1].text).toBe('Second line continues here.');
    expect(p.lines[2].text).toBe('Third and final sentence.');
    expect(p.fullText).toBe('First line of the paragraph. Second line continues here. Third and final sentence.');
    expect(p.fontSizePt).toBe(12);
    expect(p.leadingPt).toBeCloseTo(14, 0.1);
  });

  it('separates headings and body text with different font sizes into separate paragraphs', () => {
    const heading = makeSpan(0, 'Title Heading', 72, 720, 18);
    const bodyLine = makeSpan(1, 'Body paragraph text.', 72, 690, 12);

    const paragraphs = clusterPageSpansIntoParagraphs([heading, bodyLine]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].lines[0].text).toBe('Title Heading');
    expect(paragraphs[1].lines[0].text).toBe('Body paragraph text.');
  });

  it('findParagraphForSpan returns matching paragraph block or fallback', () => {
    const span1 = makeSpan(0, 'Line one', 72, 700, 12);
    const span2 = makeSpan(1, 'Line two', 72, 686, 12);

    const found = findParagraphForSpan(span2, [span1, span2]);
    expect(found.lines).toHaveLength(2);
    expect(found.lines[1].span.id).toBe(span2.id);
  });
});

describe('Paragraph Reflow Engine', () => {
  it('wraps text onto multiple lines when replacement exceeds column width', () => {
    const span1 = makeSpan(0, 'Short line.', 72, 700, 12);
    const p = findParagraphForSpan(span1, [span1]);

    // Force column width to 120 pt (roughly ~20 chars)
    const longText = 'The quick brown fox jumps over the lazy sleeping dog.';
    const reflow = reflowParagraphText(p, longText, { columnWidthPt: 120 }, defaultApproximateTextWidth);

    expect(reflow.lines.length).toBeGreaterThan(1);
    expect(reflow.lineCountDelta).toBe(reflow.lines.length - 1);
    expect(reflow.lines.map((l) => l.text).join(' ')).toBe(longText);

    // Verify each line's width does not exceed column width
    for (let i = 0; i < reflow.lines.length - 1; i++) {
      expect(reflow.lines[i].advanceWidthPt).toBeLessThanOrEqual(120);
    }
  });

  it('preserves explicit manual newlines in replacement text', () => {
    const span1 = makeSpan(0, 'Single line', 72, 700, 12);
    const p = findParagraphForSpan(span1, [span1]);

    const multiline = 'Item 1\nItem 2\nItem 3';
    const reflow = reflowParagraphText(p, multiline, { columnWidthPt: 300 });

    expect(reflow.lines).toHaveLength(3);
    expect(reflow.lines[0].text).toBe('Item 1');
    expect(reflow.lines[1].text).toBe('Item 2');
    expect(reflow.lines[2].text).toBe('Item 3');
  });

  it('calculates proper vertical baselines descending by leadingPt', () => {
    const span1 = makeSpan(0, 'Line 1', 72, 700, 12);
    const p = findParagraphForSpan(span1, [span1]);

    const reflow = reflowParagraphText(p, 'Line A\nLine B\nLine C', { leadingPt: 15, columnWidthPt: 200 });

    expect(reflow.lines).toHaveLength(3);
    expect(reflow.lines[0].baselinePt.y).toBe(700);
    expect(reflow.lines[1].baselinePt.y).toBe(685);
    expect(reflow.lines[2].baselinePt.y).toBe(670);
  });
});
