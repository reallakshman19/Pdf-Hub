import { describe, expect, it } from 'vitest';
import { buildExistingTextSpan } from '../model';
import { matchExistingTextSpanToContentStream } from '../provenanceMatcher';
import {
  simpleEncodingToUnicode,
  type ExistingTextFontDecoders,
} from '../fontDecoding';
import type { ExistingTextContentStreamReadResult } from '../provenanceTypes';
import type { ExistingTextTransform } from '../types';

function bytes(source: string): Uint8Array {
  return Uint8Array.from(Array.from(source, (character) => character.charCodeAt(0)));
}

function spanAt(text: string, transform: ExistingTextTransform, width = 30) {
  return buildExistingTextSpan(
    { revisionId: 'sha256:revision-a', pageId: 'page-a', pageIndex: 0 },
    {
      sourceIndex: 0,
      text,
      transform,
      width,
      height: Math.hypot(transform[2], transform[3]),
      fontName: 'g_d0_f1',
      direction: 'ltr',
      hasEol: false,
    },
  );
}

// Every printable ASCII glyph is 500/1000 em wide.
const winAnsiHalfEm: ExistingTextFontDecoders = {
  F1: {
    codeBytes: 1,
    toUnicode: simpleEncodingToUnicode('WinAnsi'),
    widths: new Map(Array.from({ length: 95 }, (_, index) => [0x20 + index, 0.5])),
    defaultWidth: null,
  },
};

function content(
  streams: string[],
  fontDecoders?: ExistingTextFontDecoders,
): ExistingTextContentStreamReadResult {
  return {
    pageIndex: 0,
    complete: true,
    streams: streams.map((source, streamIndex) => ({
      streamIndex,
      streamRef: `${streamIndex + 7} 0 R`,
      decodedBytes: bytes(source),
    })),
    diagnostics: [],
    fontDecoders,
  };
}

describe('existing-text provenance matcher, page-space fallback', () => {
  it('maps text drawn under a cm page transform (browser/Word output shape)', () => {
    const span = spanAt('Hello', [12, 0, 0, 12, 72, 700]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['q 1 0 0 -1 0 792 cm BT /F1 12 Tf 1 0 0 -1 72 92 Tm (Hello) Tj ET Q']),
    });
    expect(result).toMatchObject({
      status: 'matched',
      provenance: { operator: 'Tj', fontSizePt: 12, decodedText: 'Hello' },
    });
  });

  it('maps a size set through a scaled Tm with a unit Tf', () => {
    const span = spanAt('Hello', [12, 0, 0, 12, 72, 700]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F1 1 Tf 12 0 0 12 72 700 Tm (Hello) Tj ET']),
    });
    expect(result).toMatchObject({
      status: 'matched',
      provenance: { fontSizePt: 12, spacingPt: { char: 0, word: 0 } },
    });
  });

  it('maps a kerned TJ array and replaces only the strings inside the brackets', () => {
    const span = spanAt('Hello', [12, 0, 0, 12, 72, 700]);
    const stream = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(He) -20 (llo)] TJ ET';
    const result = matchExistingTextSpanToContentStream({ span, content: content([stream]) });
    expect(result.status).toBe('matched');
    if (result.status !== 'matched' || result.provenance.operator !== 'TJ') return;
    const { operandRange, arrayRange } = result.provenance;
    expect(stream.slice(operandRange.start, operandRange.end)).toBe('(He) -20 (llo)');
    expect(stream.slice(arrayRange.start, arrayRange.end)).toBe('[(He) -20 (llo)]');
  });

  it('places the origin after leading TJ adjustments', () => {
    // -500/1000 * 12 pt moves the first glyph 6 pt right.
    const span = spanAt('Hello', [12, 0, 0, 12, 78, 700]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F1 12 Tf 1 0 0 1 72 700 Tm [-500 (Hello)] TJ ET']),
    });
    expect(result).toMatchObject({ status: 'matched', provenance: { operator: 'TJ' } });
  });

  it('tracks the advance of an earlier show in the same text object', () => {
    // "Prefix" = 6 glyphs * 0.5 em * 12 pt = 36 pt, plus Tc 1 pt * 6 = 42 pt.
    const span = spanAt('Hello', [12, 0, 0, 12, 114, 700]);
    const stream = 'BT /F1 12 Tf 1 Tc 1 0 0 1 72 700 Tm (Prefix) Tj (Hello) Tj ET';
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content([stream], winAnsiHalfEm),
    });
    expect(result).toMatchObject({
      status: 'matched',
      provenance: { operator: 'Tj', operatorIndex: 6, spacingPt: { char: 1, word: 0 } },
    });
  });

  it('fails closed after a show whose advance cannot be measured', () => {
    const span = spanAt('Hello', [12, 0, 0, 12, 114, 700]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F1 12 Tf 1 Tc 1 0 0 1 72 700 Tm (Prefix) Tj (Hello) Tj ET']),
    });
    expect(result).toMatchObject({ status: 'unmapped', reason: 'NO_SIMPLE_TEXT_OPERATOR_MATCH' });
  });

  it('decodes two-byte Identity-H strings through ToUnicode', () => {
    const span = spanAt('Hé', [10, 0, 0, 10, 50, 400]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F2 10 Tf 1 0 0 1 50 400 Tm <00480102> Tj ET'], {
        F2: {
          codeBytes: 2,
          toUnicode: new Map([[0x48, 'H'], [0x0102, 'é']]),
          widths: new Map(),
          defaultWidth: 1,
        },
      }),
    });
    expect(result).toMatchObject({
      status: 'matched',
      provenance: { fontResourceName: 'F2', encoding: 'ascii-hex', decodedText: 'Hé' },
    });
  });

  it('ignores whitespace differences introduced by PDF.js gap detection', () => {
    const span = spanAt('Total amount', [12, 0, 0, 12, 72, 700], 80);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Total) -250 (amount)] TJ ET']),
    });
    expect(result).toMatchObject({ status: 'matched', provenance: { decodedText: 'Total amount' } });
  });

  it('still rejects page-space ambiguity', () => {
    const span = spanAt('Hello', [12, 0, 0, 12, 72, 700]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content([
        'q 1 0 0 1 10 0 cm BT /F1 12 Tf 1 0 0 1 62 700 Tm (Hello) Tj ET Q',
        'q 1 0 0 1 0 10 cm BT /F1 12 Tf 1 0 0 1 72 690 Tm (Hello) Tj ET Q',
      ]),
    });
    expect(result).toMatchObject({
      status: 'unmapped',
      reason: 'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
      candidateCount: 2,
    });
  });

  it('rejects a non-ASCII string when the font has no decoder', () => {
    const span = spanAt('Hé', [10, 0, 0, 10, 50, 400]);
    const result = matchExistingTextSpanToContentStream({
      span,
      content: content(['BT /F2 10 Tf 1 0 0 1 50 400 Tm <48E9> Tj ET']),
    });
    expect(result.status).toBe('unmapped');
  });
});
