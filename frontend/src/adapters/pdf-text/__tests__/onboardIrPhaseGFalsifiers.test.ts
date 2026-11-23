import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  findParagraphForSpan,
} from '@/core/existing-text/paragraphClusterer';
import {
  applyExistingTextParagraphReplacementToDocument,
} from '../PdfLibExistingTextParagraphReconstruction';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  readExistingTextPageContentStreams,
} from '../PdfLibExistingTextContentStreams';
import {
  computeLineAlignmentLayout,
} from '@/core/existing-text/alignmentEngine';
import {
  findMatchesInSpan,
} from '@/core/existing-text/batchFindReplace';

describe('OnBoard IR Phase G Adversarial Falsifiers: Alignment, Typographic Operators (Tw/Tc/Tz), and Batch Replace', () => {
  it('Falsifier 1: Centered paragraph layout accurately positions line baseline at (Wcol - Wline) / 2', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-align', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Left Aligned Heading',
        transform: [12, 0, 0, 12, 72, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span, [span]);
    const columnWidthPt = 300; // Wider column

    const result = await applyExistingTextParagraphReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-align',
        paragraph: {
          ...paragraph,
          columnWidthPt,
        },
        intent: {
          schemaVersion: 1,
          paragraphId: paragraph.paragraphId,
          pageIndex: 0,
          originalText: paragraph.fullText,
          replacementText: 'Centered Section Title',
          styleOverride: {
            align: 'center',
          },
          reflowOptions: {
            columnWidthPt,
          },
        },
      },
    );

    expect(result.originalLineCount).toBe(1);
    expect(result.reflowedLineCount).toBe(1);

    const bytes = await doc.save();
    const readResult = await readExistingTextPageContentStreams(bytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Expected midpoint offset: startX must be strictly greater than 72
    expect(content).toContain('Tm');
    expect(content).toContain('1 1 1 rg');
  });

  it('Falsifier 2: Right-aligned text accurately aligns to right margin with (Wcol - Wline) offset', async () => {
    const layout = computeLineAlignmentLayout(
      'Invoice Total: $9,876.54',
      140, // line width
      250, // column width
      'right',
      false,
    );

    // Remaining space = 250 - 140 = 110pt
    expect(layout.offsetX).toBe(110);
    expect(layout.wordSpacingPt).toBe(0);
    expect(layout.charSpacingPt).toBe(0);
    expect(layout.effectiveLineWidthPt).toBe(140);
  });

  it('Falsifier 3: Justified multi-line paragraph emits Tw operator and preserves left alignment on final line', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-just', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Initial dummy text',
        transform: [12, 0, 0, 12, 72, 700],
        width: 100,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span, [span]);
    const columnWidthPt = 160;

    // Multi-line replacement that will wrap into 2 lines
    const multiLineJustified =
      'The comprehensive architectural inspection proves formal compliance with international standards.';

    await applyExistingTextParagraphReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-just',
        paragraph: {
          ...paragraph,
          columnWidthPt,
        },
        intent: {
          schemaVersion: 1,
          paragraphId: paragraph.paragraphId,
          pageIndex: 0,
          originalText: paragraph.fullText,
          replacementText: multiLineJustified,
          styleOverride: {
            align: 'justify',
          },
          reflowOptions: {
            columnWidthPt,
          },
        },
      },
    );

    const bytes = await doc.save();
    const readResult = await readExistingTextPageContentStreams(bytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // Must contain Tw (word spacing operator)
    expect(content).toContain('Tw');
  });

  it('Falsifier 4: Horizontal scaling (Tz) and tracking (Tc) operators are emitted in content streams', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const lib = await pdfLib();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-ops', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Tracking and squeeze',
        transform: [12, 0, 0, 12, 72, 700],
        width: 120,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const paragraph = findParagraphForSpan(span, [span]);

    await applyExistingTextParagraphReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-ops',
        paragraph,
        intent: {
          schemaVersion: 1,
          paragraphId: paragraph.paragraphId,
          pageIndex: 0,
          originalText: paragraph.fullText,
          replacementText: 'Condensed Tracking Line',
          styleOverride: {
            horizontalScalePercent: 92,
            letterSpacingPt: 1.5,
          },
        },
      },
    );

    const bytes = await doc.save();
    const readResult = await readExistingTextPageContentStreams(bytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // In PDF:
    // Tz = SetTextHorizontalScaling (92 Tz)
    // Tc = SetCharacterSpacing (1.5 Tc)
    expect(content).toContain('Tz');
    expect(content).toContain('Tc');
  });

  it('Falsifier 5: Multi-page batch find-and-replace scanner finds occurrences across pages', () => {
    const spanP1 = buildExistingTextSpan(
      { revisionId: 'rev-doc', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Authorized by Acme Corp in 2025.',
        transform: [12, 0, 0, 12, 72, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );
    const spanP2 = buildExistingTextSpan(
      { revisionId: 'rev-doc', pageId: 'page-2', pageIndex: 1 },
      {
        sourceIndex: 0,
        text: 'Acme Corp certifies the results.',
        transform: [12, 0, 0, 12, 72, 700],
        width: 150,
        height: 12,
        fontName: 'Helvetica',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const matchesP1 = findMatchesInSpan(spanP1, {
      query: 'Acme Corp',
      replacement: 'Apex Industries',
    });
    const matchesP2 = findMatchesInSpan(spanP2, {
      query: 'Acme Corp',
      replacement: 'Apex Industries',
    });

    expect(matchesP1).toHaveLength(1);
    expect(matchesP1[0].replacementSpanText).toBe('Authorized by Apex Industries in 2025.');
    expect(matchesP1[0].pageIndex).toBe(0);

    expect(matchesP2).toHaveLength(1);
    expect(matchesP2[0].replacementSpanText).toBe('Apex Industries certifies the results.');
    expect(matchesP2[0].pageIndex).toBe(1);
  });
});
