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
});
