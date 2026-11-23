import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { buildExistingTextSpan, createExistingTextDeleteIntent } from '@/core/existing-text/model';
import { matchExistingTextSpanToContentStream } from '@/core/existing-text/provenanceMatcher';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';
import {
  eraseExistingTextSpanInBytes,
} from '../PdfLibExistingTextErasure';

describe('PdfLibExistingTextErasure', () => {
  it('excises unrotated native text span replacing it with () Tj in content stream', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      'BT',
      `/${font.name} 12 Tf`,
      '1 0 0 1 72 700 Tm',
      '(CONFIDENTIAL DRAFT) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-erasure-native';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'CONFIDENTIAL DRAFT',
        transform: [12, 0, 0, 12, 72, 700],
        width: 140,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'native-excision');
    const { modifiedBytes, result } = await eraseExistingTextSpanInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      intent,
      provenance: (match as any).provenance,
    });

    expect(result.success).toBe(true);
    expect(result.strategyApplied).toBe('native-excision');
    expect(result.originalText).toBe('CONFIDENTIAL DRAFT');

    // Verify stream content: operand is now empty ()
    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const updatedText = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    expect(updatedText).toContain('() Tj');
    expect(updatedText).not.toContain('(CONFIDENTIAL DRAFT)');
  });

  it('inpaints rotated text span with whiteout rectangle when native excision is not applicable', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '0 1 -1 0 100 200 Tm',
      '(VERTICAL MARK) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-erasure-rotated';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'VERTICAL MARK',
        transform: [0, 12, -12, 0, 100, 200],
        width: 90,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    const streams = await readExistingTextPageContentStreams(bytes, 0);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });
    expect(match.status).toBe('matched');

    const intent = createExistingTextDeleteIntent(span, 'auto');
    const { modifiedBytes, result } = await eraseExistingTextSpanInBytes({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      intent,
      provenance: (match as any).provenance,
    });

    expect(result.success).toBe(true);
    expect(result.strategyApplied).toBe('visual-inpaint');
    expect(result.visualClearanceProved).toBe(true);
    expect(result.details.whiteoutEmitted).toBe(true);
    expect(result.details.rotationDegrees).toBe(90);

    // Verify stream content: contains rotated whiteout
    const updatedStreams = await readExistingTextPageContentStreams(modifiedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const updatedText = updatedStreams.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // In PDF: rotated rectangle emits [0, 1, -1, 0, ...] cm
    expect(updatedText).toMatch(/0(\.0+)?\s+1(\.0+)?\s+-1(\.0+)?\s+0(\.0+)?/);
  });
});
