import { describe, it, expect } from 'vitest';
import {
  buildExistingTextSpan,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import {
  scanExistingTextContentStream,
} from '@/core/existing-text/contentStreamScanner';
import {
  lexContentStream,
} from '@/core/pdf-content-stream/lexer';
import type {
  ExistingTextContentStreamReadResult,
} from '@/core/existing-text/provenanceTypes';
import {
  evaluateExistingTextUiCapability,
} from '../PdfLibExistingTextUiEvaluation';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

function bytes(source: string): Uint8Array {
  return Uint8Array.from(Array.from(source, (c) => c.charCodeAt(0)));
}

function content(streams: string[]): ExistingTextContentStreamReadResult {
  return {
    pageIndex: 0,
    complete: true,
    streams: streams.map((source, streamIndex) => ({
      streamIndex,
      streamRef: `${streamIndex + 1} 0 R`,
      decodedBytes: bytes(source),
    })),
    diagnostics: [],
  };
}

describe('OnBoard IR Phase D Adversarial Falsifiers', () => {
  it('Falsifier 1: 2-Byte Big-Endian ASCII decoding for Identity-H CID text in content streams', () => {
    // 2-byte hex string representing 'Hello' in Identity-H CID encoding
    const stream = 'BT /F1 12 Tf 1 0 0 1 50 700 Tm <00480065006C006C006F> Tj ET';

    // 1. Lexer test
    const lexTokens = lexContentStream(stream);
    const hexToken = lexTokens.tokens.find((t) => t.kind === 'hex-string');
    expect(hexToken).toBeDefined();
    expect(hexToken?.decodedText).toBe('Hello');

    // 2. Scanner test
    const scanResult = scanExistingTextContentStream({
      streamIndex: 0,
      streamRef: '1 0 R',
      decodedBytes: bytes(stream),
    });
    expect(scanResult.candidates.length).toBe(1);
    expect(scanResult.candidates[0].decodedText).toBe('Hello');

    // Negative test: non-ASCII byte sequence (e.g. CIDs > 0x7E) must return null / unmapped decodedText
    const nonAsciiStream = 'BT /F1 12 Tf 1 0 0 1 50 700 Tm <04100411> Tj ET';
    const nonAsciiTokens = lexContentStream(nonAsciiStream);
    const nonAsciiToken = nonAsciiTokens.tokens.find((t) => t.kind === 'hex-string');
    expect(nonAsciiToken?.decodedText).toBeUndefined();
  });

  it('Falsifier 2: AST candidate operatorRange must delineate operator token so operandRange.end < operatorRange.start', () => {
    // Multi-stream with stream 0 having unclosed q forces AST fallback
    const stream0 = 'q 1 0 0 1 0 0 cm';
    const stream1 = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Sample) Tj ET Q';

    const span = buildExistingTextSpan(
      { revisionId: 'rev-1', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Sample',
        transform: [12, 0, 0, 12, 72, 700],
        width: 36,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    const c = content([stream0, stream1]);
    const match = matchExistingTextSpanToContentStream({ span, content: c });

    expect(match.status).toBe('matched');
    if (match.status === 'matched') {
      const { operatorRange, operandRange } = match.provenance;
      // Strict validator condition: operand must end before the operator begins
      expect(operandRange.end).toBeLessThanOrEqual(operatorRange.start);
      // Operator range must exactly span the 'Tj' operator
      expect(operatorRange.end - operatorRange.start).toBe(2);
    }
  });

  it('Falsifier 3: Native fit evaluation must decouple from visual clearance single-stream constraint on multi-stream pages', async () => {
    // PDF with 2 content streams
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);

    // Stream 1: state
    const s1 = doc.context.stream('q 1 0 0 1 0 0 cm\n');
    // Stream 2: text
    const s2 = doc.context.stream('BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q\n');
    const r1 = doc.context.register(s1);
    const r2 = doc.context.register(s2);
    page.node.set(PDFName.of('Contents'), doc.context.obj([r1, r2]));

    // Register font in page resources
    page.node.set(
      PDFName.of('Resources'),
      doc.context.obj({
        Font: {
          F1: helvetica.ref,
        },
      }),
    );

    const pdfBytes = await doc.save();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-multi', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 72, 700],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    // Replacement text that fits natively: 'Hi'
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes,
      currentRevisionId: 'rev-multi',
      span,
      replacementText: 'Hi',
    });

    // Must be allowed natively, NOT blocked by MULTIPLE_CONTENT_STREAMS
    expect(capability.status).toBe('native');
  });

  it('Falsifier 4: Subset font with missing glyphs must be classified as unavailable with exact missing glyphs reported', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);

    const limitedCmapString = [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Subset-ToUnicode def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      '4 beginbfchar',
      '<0048> <0048>', // 'H'
      '<0065> <0065>', // 'e'
      '<006C> <006C>', // 'l'
      '<006F> <006F>', // 'o'
      'endbfchar',
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end',
    ].join('\n');

    const toUnicodeStream = doc.context.stream(limitedCmapString);
    const toUnicodeRef = doc.context.register(toUnicodeStream);

    const cidFontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'BAAAAA+SubsetCustomFont',
      CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 },
      DW: 1000,
    });
    const cidFontRef = doc.context.register(cidFontDict);

    const type0FontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'BAAAAA+SubsetCustomFont',
      Encoding: 'Identity-H',
      DescendantFonts: [cidFontRef],
      ToUnicode: toUnicodeRef,
    });
    const type0FontRef = doc.context.register(type0FontDict);

    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ F1: type0FontRef }),
    }));

    const contentStream = doc.context.stream([
      'BT',
      '/F1 12 Tf',
      '1 0 0 1 72 700 Tm',
      '<00480065006C006C006F> Tj',
      'ET',
    ].join('\n'));
    const contentStreamRef = doc.context.register(contentStream);
    page.node.set(PDFName.of('Contents'), contentStreamRef);

    const pdfBytes = await doc.save();

    const span = buildExistingTextSpan(
      { revisionId: 'rev-subset', pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [12, 0, 0, 12, 72, 700],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

    // 'Héllü': 'é' and 'ü' are missing from the subset CMap
    const capability = await evaluateExistingTextUiCapability({
      pdfBytes,
      currentRevisionId: 'rev-subset',
      span,
      replacementText: 'Héllü',
    });

    expect(capability.status).toBe('unavailable');
    if (capability.status === 'unavailable') {
      expect(capability.reasons[0]).toContain('The font subset does not contain characters: é, ü');
      expect(capability.nativeFit?.status).toBe('unmeasurable');
      if (capability.nativeFit?.status === 'unmeasurable') {
        expect(capability.nativeFit.reason).toBe('MISSING_SUBSET_GLYPHS');
        expect(capability.nativeFit.missingCharacters).toEqual(['é', 'ü']);
      }
    }
  });
});
