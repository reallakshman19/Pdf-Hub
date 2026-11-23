import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  clusterPageSpansIntoParagraphs,
  findParagraphForSpan,
} from '@/core/existing-text/paragraphClusterer';
import {
  reflowParagraphText,
} from '@/core/existing-text/paragraphReflowEngine';
import {
  applyExistingTextParagraphReplacementToDocument,
} from '../PdfLibExistingTextParagraphReconstruction';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  readExistingTextPageContentStreams,
} from '../PdfLibExistingTextContentStreams';

describe('OnBoard IR Phase F Adversarial Falsifiers: Multi-Line Paragraph Reflow & Block Editing', () => {
  it('Falsifier 1: Paragraph cluster grouping across multiple Td / line-feed text operators', async () => {
    // Generate a PDF with 3 lines spaced 14pt apart
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);

    // Construct mock page spans representing 3 lines of an introduction paragraph
    const spans = [
      buildExistingTextSpan(
        { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 0,
          text: 'This is the first sentence of our executive summary.',
          transform: [12, 0, 0, 12, 72, 700],
          width: 250,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
      buildExistingTextSpan(
        { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 1,
          text: 'It describes the foundational architecture and scope.',
          transform: [12, 0, 0, 12, 72, 686],
          width: 260,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
      buildExistingTextSpan(
        { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 2,
          text: 'All stakeholders have approved the core deliverables.',
          transform: [12, 0, 0, 12, 72, 672],
          width: 255,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
    ];

    const clusters = clusterPageSpansIntoParagraphs(spans);

    expect(clusters).toHaveLength(1);
    const p = clusters[0];
    expect(p.lines).toHaveLength(3);
    expect(p.fullText).toBe(
      'This is the first sentence of our executive summary. It describes the foundational architecture and scope. All stakeholders have approved the core deliverables.',
    );
    expect(p.fontSizePt).toBe(12);
    expect(p.leadingPt).toBeCloseTo(14, 0.1);
    expect(p.columnWidthPt).toBeGreaterThanOrEqual(260);

    // Bounding box must encompass all 3 lines
    expect(p.boundsPt.x).toBe(72);
    expect(p.boundsPt.width).toBeGreaterThanOrEqual(260);
    expect(p.boundsPt.height).toBeGreaterThanOrEqual(28);
  });

  it('Falsifier 2: Multi-line reflow when line 1 overflows into line 2 without column overflow', async () => {
    const span1 = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Short line 1',
        transform: [12, 0, 0, 12, 72, 700],
        width: 70,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );
    const span2 = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 1,
        text: 'Short line 2',
        transform: [12, 0, 0, 12, 72, 686],
        width: 70,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span1, [span1, span2]);
    const columnWidthPt = 150; // Constrain column width

    const expandedText =
      'This is an extensively lengthened sentence that definitely exceeds the 150pt column limit and naturally wraps onto subsequent lines smoothly.';

    const reflow = reflowParagraphText(paragraph, expandedText, { columnWidthPt });

    // Should break into at least 3 or 4 lines
    expect(reflow.lines.length).toBeGreaterThanOrEqual(3);

    // Invariant: every single wrapped line must respect the column boundary
    for (const line of reflow.lines) {
      expect(line.advanceWidthPt).toBeLessThanOrEqual(columnWidthPt);
    }

    // Baselines must descend strictly monotonically
    for (let i = 1; i < reflow.lines.length; i++) {
      expect(reflow.lines[i].baselinePt.y).toBeLessThan(reflow.lines[i - 1].baselinePt.y);
      const dy = reflow.lines[i - 1].baselinePt.y - reflow.lines[i].baselinePt.y;
      expect(dy).toBeCloseTo(paragraph.leadingPt, 0.1);
    }
  });

  it('Falsifier 3: Line contraction (reducing 3 lines to 1 line) with zero ghost text', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    // 3 lines originally
    const spans = [
      buildExistingTextSpan(
        { revisionId: 'rev-contract', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 0,
          text: 'First line to disappear.',
          transform: [12, 0, 0, 12, 72, 700],
          width: 140,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
      buildExistingTextSpan(
        { revisionId: 'rev-contract', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 1,
          text: 'Second line to disappear.',
          transform: [12, 0, 0, 12, 72, 686],
          width: 150,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
      buildExistingTextSpan(
        { revisionId: 'rev-contract', pageId: 'page-1', pageIndex: 0 },
        {
          sourceIndex: 2,
          text: 'Third line to disappear.',
          transform: [12, 0, 0, 12, 72, 672],
          width: 145,
          height: 12,
          fontName: 'Helvetica',
          direction: 'ltr',
          hasEol: false,
        },
      ),
    ];

    const paragraph = findParagraphForSpan(spans[0], spans);
    expect(paragraph.lines).toHaveLength(3);

    // Apply contraction replacement to a single word
    const mutationResult = await applyExistingTextParagraphReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-contract',
        paragraph,
        intent: {
          schemaVersion: 1,
          paragraphId: paragraph.paragraphId,
          pageIndex: 0,
          originalText: paragraph.fullText,
          replacementText: 'Contracted.',
        },
      },
    );

    expect(mutationResult.originalLineCount).toBe(3);
    expect(mutationResult.reflowedLineCount).toBe(1);
    expect(mutationResult.mutationStrategy).toBe('reconstructed-block');

    const bytes = await doc.save();
    const readResult = await readExistingTextPageContentStreams(bytes, 0);

    // The streams must contain the whiteout rectangle covering original height
    const decoder = new TextDecoder();
    const allText = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');
    expect(allText).toContain('1 1 1 rg'); // white fill
    expect(allText).toContain('f'); // fill path
    expect(allText).toContain('436F6E747261637465642E'); // hex encoded 'Contracted.' Tj
  });

  it('Falsifier 4: Multi-line paragraph edit with font style override', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-style', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Standard normal paragraph.',
        transform: [12, 0, 0, 12, 72, 700],
        width: 160,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span, [span]);

    const result = await applyExistingTextParagraphReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-style',
        paragraph,
        intent: {
          schemaVersion: 1,
          paragraphId: paragraph.paragraphId,
          pageIndex: 0,
          originalText: paragraph.fullText,
          replacementText: 'Bold Italic Red Multi-line Paragraph Edit',
          styleOverride: {
            bold: true,
            italic: true,
            fontSizePt: 14,
            colorHex: '#dc2626',
          },
        },
      },
    );

    expect(result.originalLineCount).toBe(1);
    expect(result.reflowedLineCount).toBeGreaterThanOrEqual(1);

    const savedBytes = await doc.save();
    expect(savedBytes.byteLength).toBeGreaterThan(0);
  });

  it('Falsifier 5: Strict bounding and non-interference with adjacent paragraphs', async () => {
    // Two distinct paragraphs separated by vertical distance
    const para1Span1 = buildExistingTextSpan(
      { revisionId: 'rev-adj', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Paragraph One Line 1',
        transform: [12, 0, 0, 12, 72, 700],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );
    const para1Span2 = buildExistingTextSpan(
      { revisionId: 'rev-adj', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 1,
        text: 'Paragraph One Line 2',
        transform: [12, 0, 0, 12, 72, 686],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    // Paragraph 2 is further down at y = 550
    const para2Span1 = buildExistingTextSpan(
      { revisionId: 'rev-adj', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 2,
        text: 'Paragraph Two Line 1',
        transform: [12, 0, 0, 12, 72, 550],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const allSpans = [para1Span1, para1Span2, para2Span1];
    const clusters = clusterPageSpansIntoParagraphs(allSpans);

    // Must be clustered into exactly 2 distinct paragraphs
    expect(clusters).toHaveLength(2);

    const p1 = clusters[0];
    const p2 = clusters[1];

    expect(p1.lines).toHaveLength(2);
    expect(p1.fullText).toBe('Paragraph One Line 1 Paragraph One Line 2');

    expect(p2.lines).toHaveLength(1);
    expect(p2.fullText).toBe('Paragraph Two Line 1');

    // Paragraph 1 bounds should not intersect Paragraph 2 bounds
    expect(p1.boundsPt.y).toBeGreaterThan(p2.boundsPt.y + p2.boundsPt.height);
  });
});
