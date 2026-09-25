import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  buildExistingTextSpan,
} from '../model';
import {
  matchExistingTextSpanToContentStream,
} from '../provenanceMatcher';
import type {
  ExistingTextContentStreamReadResult,
} from '../provenanceTypes';

function bytes(
  source: string,
): Uint8Array {
  return Uint8Array.from(
    Array.from(
      source,
      (character) =>
        character.charCodeAt(0),
    ),
  );
}

const span =
  buildExistingTextSpan(
    {
      revisionId:
        'sha256:revision-a',
      pageId: 'page-a',
      pageIndex: 0,
    },
    {
      sourceIndex: 0,
      text: 'Hello',
      transform: [
        12,
        0,
        0,
        12,
        72,
        700,
      ],
      width: 30,
      height: 12,
      fontName: 'g_d0_f1',
      direction: 'ltr',
      hasEol: false,
    },
  );

function content(
  streams: string[],
): ExistingTextContentStreamReadResult {
  return {
    pageIndex: 0,
    complete: true,
    streams: streams.map(
      (source, streamIndex) => ({
        streamIndex,
        streamRef:
          `${streamIndex + 7} 0 R`,
        decodedBytes:
          bytes(source),
      }),
    ),
    diagnostics: [],
  };
}

describe('existing-text provenance matcher', () => {
  it('maps a native candidate to one exact simple operator', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm <48656C6C6F> Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: span.id,
        provenance: {
          operator: 'Tj',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            72,
            700,
          ],
        },
      });
  });

  it('maps a native candidate to one exact single-string TJ array operator', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello)] TJ ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: span.id,
        provenance: {
          operator: 'TJ',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            72,
            700,
          ],
        },
      });
  });

  it('detects ambiguity between Tj and TJ candidates matching the same span', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET',
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello)] TJ ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
        candidateCount: 2,
      });
  });

  it('does not map incomplete stream sets', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: {
          pageIndex: 0,
          complete: false,
          streams: [],
          diagnostics: [{
            streamIndex: 0,
            streamRef: '7 0 R',
            code:
              'CONTENT_STREAM_DECODE_FAILED',
            message:
              'decode failed',
          }],
        },
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'INCOMPLETE_CONTENT_STREAM_SET',
      });
  });

  it('rejects ambiguous matches across streams', () => {
    const simple =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET';
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          simple,
          simple,
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
        candidateCount: 2,
      });
  });

  it('requires text, font size and origin agreement', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          'BT /F1 11 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET',
          'BT /F1 12 Tf 1 0 0 1 72 699 Tm (Hello) Tj ET',
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (World) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'NO_SIMPLE_TEXT_OPERATOR_MATCH',
      });
  });

  it('rejects spans whose PDF.js transform is outside the simple horizontal subset', () => {
    const stretched =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 1,
          text: 'Hello',
          transform: [
            10,
            0,
            0,
            12,
            72,
            700,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    expect(
      stretched.editability,
    ).toBe(
      'native-replacement-candidate',
    );

    const result =
      matchExistingTextSpanToContentStream({
        span: stretched,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'SPAN_OUTSIDE_SIMPLE_TEXT_SUBSET',
      });
  });

  it('maps a native candidate positioned by Tm followed by Td to Tj', () => {
    const spanTd =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 0,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            82,
            680,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    const result =
      matchExistingTextSpanToContentStream({
        span: spanTd,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: spanTd.id,
        provenance: {
          operator: 'Tj',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            82,
            680,
          ],
        },
      });
  });

  it('maps a native candidate positioned by Tm followed by Td to single-string TJ', () => {
    const spanTd =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 0,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            82,
            680,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    const result =
      matchExistingTextSpanToContentStream({
        span: spanTd,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td [(Hello)] TJ ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: spanTd.id,
        provenance: {
          operator: 'TJ',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            82,
            680,
          ],
        },
      });
  });

  it('maps text positioned by Td following a previous text show', () => {
    const spanTd =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 1,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            82,
            680,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    const result =
      matchExistingTextSpanToContentStream({
        span: spanTd,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Prefix) Tj 10 -20 Td (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: spanTd.id,
        provenance: {
          operator: 'Tj',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            82,
            680,
          ],
        },
      });
  });

  it('maps text positioned by repeated cumulative Td translations', () => {
    const spanTd =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 0,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            82,
            680,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    const result =
      matchExistingTextSpanToContentStream({
        span: spanTd,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm 5 -10 Td 5 -10 Td (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'matched',
        spanId: spanTd.id,
        provenance: {
          operator: 'Tj',
          decodedText: 'Hello',
          fontSizePt: 12,
          textMatrix: [
            1,
            0,
            0,
            1,
            82,
            680,
          ],
        },
      });
  });

  it('rejects match when final origin after Td does not agree with span origin', () => {
    const result =
      matchExistingTextSpanToContentStream({
        span,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'NO_SIMPLE_TEXT_OPERATOR_MATCH',
      });
  });

  it('detects ambiguity when multiple Td candidates match the same span', () => {
    const spanTd =
      buildExistingTextSpan(
        {
          revisionId:
            'sha256:revision-a',
          pageId: 'page-a',
          pageIndex: 0,
        },
        {
          sourceIndex: 0,
          text: 'Hello',
          transform: [
            12,
            0,
            0,
            12,
            82,
            680,
          ],
          width: 30,
          height: 12,
          fontName: 'g_d0_f1',
          direction: 'ltr',
          hasEol: false,
        },
      );

    const result =
      matchExistingTextSpanToContentStream({
        span: spanTd,
        content: content([
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td (Hello) Tj ET',
          'BT /F1 12 Tf 1 0 0 1 80 690 Tm 2 -10 Td (Hello) Tj ET',
        ]),
      });

    expect(result)
      .toMatchObject({
        status: 'unmapped',
        reason:
          'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
        candidateCount: 2,
      });
  });
});
