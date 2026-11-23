import { describe, it, expect } from 'vitest';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import type {
  ExistingTextContentStreamReadResult,
} from '@/core/existing-text/provenanceTypes';
import {
  extractPdfFontFromPage,
} from '../PdfLibFontExtractor';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

function bytes(source: string): Uint8Array {
  return Uint8Array.from(Array.from(source, (c) => c.charCodeAt(0)));
}

function content(streams: string[]): ExistingTextContentStreamReadResult {
  return {
    pageIndex: 0,
    complete: true,
    streams: streams.map((source, streamIndex) => ({
      streamIndex,
      streamRef: `${streamIndex + 7} 0 R`,
      decodedBytes: bytes(source),
    })),
    diagnostics: [],
  };
}

describe('OnBoard IR Phase C Adversarial Falsifiers', () => {
  it('Falsifier 1: AST candidate generation must track intermediate textMatrix across multiple lines in BT...ET', () => {
    // Multi-stream page triggers AST fallback because stream 0 has unclosed q
    // Stream 1 has a multi-line BT...ET block:
    // Line 1: y = 700
    // Line 2: y = 680 (via 0 -20 Td)
    const stream0 = 'q 1 0 0 1 0 0 cm';
    const stream1 = [
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 72 700 Tm',
      '(Line One) Tj',
      '0 -20 Td',
      '(Line Two) Tj',
      'ET',
      'Q',
    ].join('\n');

    const spanLine1 = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Line One',
        transform: [12, 0, 0, 12, 72, 700],
        width: 50,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const spanLine2 = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 1,
        text: 'Line Two',
        transform: [12, 0, 0, 12, 72, 680],
        width: 50,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const res1 = matchExistingTextSpanToContentStream({
      span: spanLine1,
      content: content([stream0, stream1]),
    });

    const res2 = matchExistingTextSpanToContentStream({
      span: spanLine2,
      content: content([stream0, stream1]),
    });

    // Both lines must match their respective spans with exact y-coordinates
    expect(res1.status).toBe('matched');
    if (res1.status === 'matched') {
      expect(res1.provenance.textMatrix[5]).toBeCloseTo(700, 2);
      expect(res1.provenance.decodedText).toBe('Line One');
    }

    expect(res2.status).toBe('matched');
    if (res2.status === 'matched') {
      expect(res2.provenance.textMatrix[5]).toBeCloseTo(680, 2);
      expect(res2.provenance.decodedText).toBe('Line Two');
    }
  });

  it('Falsifier 2: Descendant CIDFont dictionary /ToUnicode stream lookup (ISO 32000-1 §9.10.3)', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([100, 100]);

    // Construct a CMap
    const cmapSource = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Custom-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0001> <0001> <0041>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
    const toUnicodeStream = doc.context.flateStream(cmapSource);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    // Descendant CIDFont has /ToUnicode, outer Type0 font omits it
    const cidFontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: lib.PDFName.of('TestSubsetFont'),
      CIDSystemInfo: {
        Registry: 'Adobe',
        Ordering: 'Identity',
        Supplement: 0,
      },
      DW: 1000,
      ToUnicode: toUnicodeRef,
    });
    const cidFontRef = doc.context.register(cidFontDict);

    const type0Dict = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: lib.PDFName.of('TestSubsetFont'),
      Encoding: lib.PDFName.of('Identity-H'),
      DescendantFonts: [cidFontRef],
      // Note: No /ToUnicode here on the root Type0 font dict!
    });
    const type0Ref = doc.context.register(type0Dict);

    page.node.set(
      lib.PDFName.of('Resources'),
      doc.context.obj({
        Font: {
          F1: type0Ref,
        },
      }),
    );

    const meta = extractPdfFontFromPage(page, '/F1', lib);
    expect(meta).not.toBeNull();
    // Must find CMap from descendant CIDFont
    expect(meta?.cMap).not.toBeNull();
    expect(meta?.cMap?.unicodeToCid.get('A')).toBe(1);
    expect(meta?.cMap?.cidToUnicode.get(1)).toBe('A');
  });

  it('Falsifier 3: Single-string TJ array candidate must reject kerning numbers in operand.items', () => {
    // Array with kerning numbers [-10 (Hello) 20] TJ must not be admitted as a simple text candidate
    const stream0 = 'q 1 0 0 1 0 0 cm';
    const stream1 = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm [-10 (Hello) 20] TJ ET Q';

    const span = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 72, 700],
        width: 50,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const res = matchExistingTextSpanToContentStream({
      span,
      content: content([stream0, stream1]),
    });

    // Content stream scanner strictly excludes arrays with numbers; AST fallback must do the same
    expect(res.status).toBe('unmapped');
    if (res.status === 'unmapped') {
      expect(res.reason).toBe('NO_SIMPLE_TEXT_OPERATOR_MATCH');
    }
  });

  it('Falsifier 4: multi-stream replacement must succeed when target stream contains Q closed from prior stream q', async () => {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([200, 200]);

    // Embed Standard-14 font Helvetica
    const helvetica = await doc.embedFont(lib.StandardFonts.Helvetica);
    const fontRef = doc.context.register(
      doc.context.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: lib.PDFName.of('Helvetica'),
        Encoding: lib.PDFName.of('WinAnsiEncoding'),
      }),
    );
    page.node.set(
      lib.PDFName.of('Resources'),
      doc.context.obj({
        Font: {
          F1: fontRef,
        },
      }),
    );

    // Stream 0: opens q
    const stream0 = doc.context.flateStream('q 1 0 0 1 0 0 cm\n');
    const ref0 = doc.context.register(stream0);

    // Stream 1: text and closes Q
    const stream1 = doc.context.flateStream('BT /F1 12 Tf 1 0 0 1 50 100 Tm (Hello) Tj ET Q\n');
    const ref1 = doc.context.register(stream1);

    page.node.set(lib.PDFName.of('Contents'), doc.context.obj([ref0, ref1]));

    const span = buildExistingTextSpan(
      { revisionId: 'rev-multi', pageId: 'page-0', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 50, 100],
        width: helvetica.widthOfTextAtSize('Hello', 12),
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const { matchExistingTextSpanToContentStream } = await import(
      '@/core/existing-text/provenanceMatcher'
    );
    const { createExistingTextEditIntent } = await import(
      '@/core/existing-text/model'
    );
    const { readExistingTextPageContentStreamsFromDocument } = await import(
      '../PdfLibExistingTextContentStreams'
    );
    const { applySimpleExistingTextReplacementToDocument } = await import(
      '../PdfLibExistingTextReplacement'
    );

    const streams = readExistingTextPageContentStreamsFromDocument(doc, 0, lib);
    const match = matchExistingTextSpanToContentStream({ span, content: streams });

    expect(match.status).toBe('matched');
    if (match.status !== 'matched') return;

    const intent = createExistingTextEditIntent(span, 'Hi');

    // Now execute the replacement mutation
    const mutationResult = await applySimpleExistingTextReplacementToDocument(
      doc,
      lib,
      {
        currentRevisionId: 'rev-multi',
        intent,
        span,
        provenance: match.provenance,
      },
    );

    expect(mutationResult.replacementText).toBe('Hi');
  });
});
