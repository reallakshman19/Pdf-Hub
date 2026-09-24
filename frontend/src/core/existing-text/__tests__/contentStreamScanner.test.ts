import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  scanExistingTextContentStream,
} from '../contentStreamScanner';
import type {
  ExistingTextDecodedContentStream,
} from '../provenanceTypes';

function stream(
  content: string,
): ExistingTextDecodedContentStream {
  return {
    streamIndex: 0,
    streamRef: '7 0 R',
    decodedBytes:
      Uint8Array.from(
        Array.from(
          content,
          (character) =>
            character.charCodeAt(0),
        ),
      ),
  };
}

describe('existing-text content stream scanner', () => {
  it('captures a simple literal-string Tj with source byte ranges and text state', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete)
      .toBe(true);
    expect(result.candidates)
      .toHaveLength(1);
    expect(result.candidates[0])
      .toMatchObject({
        streamIndex: 0,
        streamRef: '7 0 R',
        operator: 'Tj',
        decodedText: 'Hello',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        fontSizePt: 12,
        textMatrix: [
          1,
          0,
          0,
          1,
          72,
          700,
        ],
      });

    const candidate =
      result.candidates[0];
    expect(
      source.slice(
        candidate.operandRange
          .start,
        candidate.operandRange
          .end,
      ),
    ).toBe('(Hello)');
    expect(
      source.slice(
        candidate.operatorRange
          .start,
        candidate.operatorRange
          .end,
      ),
    ).toBe('Tj');
  });

  it('captures an ASCII hex-string Tj', () => {
    const result =
      scanExistingTextContentStream(
        stream(
          'BT /F2 9 Tf 1 0 0 1 10 20 Tm <48656C6C6F> Tj ET',
        ),
      );

    expect(result.candidates[0])
      .toMatchObject({
        decodedText: 'Hello',
        encoding: 'ascii-hex',
        fontResourceName: 'F2',
        fontSizePt: 9,
      });
  });

  it('does not produce native candidates for non-ASCII encoded strings', () => {
    const result =
      scanExistingTextContentStream(
        stream(
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm <FEFF0048> Tj ET',
        ),
      );

    expect(result.complete)
      .toBe(true);
    expect(result.candidates)
      .toEqual([]);
  });

  it('rejects placement affected by non-identity cm, Td, TJ or horizontal scaling', () => {
    const samples = [
      '2 0 0 2 0 0 cm BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 5 0 Td (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello)] TJ ET',
      'BT /F1 12 Tf 80 Tz 1 0 0 1 72 700 Tm (Hello) Tj ET',
    ];

    for (const sample of samples) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates)
        .toEqual([]);
    }
  });

  it('requires a fresh explicit Tm after a text-show advance', () => {
    const result =
      scanExistingTextContentStream(
        stream(
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (One) Tj (Two) Tj 1 0 0 1 72 680 Tm (Three) Tj ET',
        ),
      );

    expect(
      result.candidates.map(
        (candidate) =>
          candidate.decodedText,
      ),
    ).toEqual([
      'One',
      'Three',
    ]);
  });

  it('fails closed on malformed content syntax', () => {
    const result =
      scanExistingTextContentStream(
        stream(
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm (unterminated Tj ET',
        ),
      );

    expect(result.complete)
      .toBe(false);
    expect(result.candidates)
      .toEqual([]);
    expect(result.diagnostics[0])
      .toContain(
        'Malformed literal string',
      );
  });
});
