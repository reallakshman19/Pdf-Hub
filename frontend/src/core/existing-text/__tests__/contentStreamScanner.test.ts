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

  it('captures a simple single-string literal TJ with exact array and operand ranges', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello)] TJ ET';
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
        operator: 'TJ',
        decodedText: 'Hello',
        encoding: 'ascii-literal',
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
    expect(candidate.operator).toBe('TJ');
    if (candidate.operator === 'TJ') {
      expect(
        source.slice(
          candidate.arrayRange.start,
          candidate.arrayRange.end,
        ),
      ).toBe('[(Hello)]');
    }
    expect(
      source.slice(
        candidate.operandRange.start,
        candidate.operandRange.end,
      ),
    ).toBe('(Hello)');
    expect(
      source.slice(
        candidate.operatorRange.start,
        candidate.operatorRange.end,
      ),
    ).toBe('TJ');
  });

  it('captures a single-string ASCII hex TJ array', () => {
    const source =
      'BT /F2 9 Tf 1 0 0 1 10 20 Tm [<48656C6C6F>] TJ ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.candidates)
      .toHaveLength(1);
    expect(result.candidates[0])
      .toMatchObject({
        operator: 'TJ',
        decodedText: 'Hello',
        encoding: 'ascii-hex',
        fontResourceName: 'F2',
        fontSizePt: 9,
      });

    const candidate = result.candidates[0];
    if (candidate.operator === 'TJ') {
      expect(
        source.slice(
          candidate.arrayRange.start,
          candidate.arrayRange.end,
        ),
      ).toBe('[<48656C6C6F>]');
    }
    expect(
      source.slice(
        candidate.operandRange.start,
        candidate.operandRange.end,
      ),
    ).toBe('<48656C6C6F>');
  });

  it('rejects TJ arrays with numeric adjustments, multiple strings, or empty contents', () => {
    const unsupportedSamples = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hel) -20 (lo)] TJ ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello) -120] TJ ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [120 (Hello)] TJ ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello) (World)] TJ ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [] TJ ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [-20] TJ ET',
    ];

    for (const sample of unsupportedSamples) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates)
        .toEqual([]);
    }
  });

  it('rejects placement affected by non-identity cm, T*, or horizontal scaling, and invalidates after TJ', () => {
    const samples = [
      '2 0 0 2 0 0 cm BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm T* (Hello) Tj ET',
      'BT /F1 12 Tf 80 Tz 1 0 0 1 72 700 Tm (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(Hello) -20 (lo)] TJ ET',
    ];

    for (const sample of samples) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates)
        .toEqual([]);
    }

    // A text-show via TJ invalidates subsequent text placement until another Tm/Td is encountered
    const subsequent =
      scanExistingTextContentStream(
        stream(
          'BT /F1 12 Tf 1 0 0 1 72 700 Tm [(First)] TJ (Second) Tj ET',
        ),
      );
    expect(
      subsequent.candidates.map((c) => c.decodedText),
    ).toEqual(['First']);
  });

  it('captures a Tj candidate positioned by relative Td', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td (Hello) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      fontSizePt: 12,
      fontResourceName: 'F1',
      textMatrix: [1, 0, 0, 1, 82, 680],
    });
  });

  it('captures a Tj candidate positioned by repeated Td', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td 5 -10 Td (Hello) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 87, 670],
    });
  });

  it('preserves the text-line matrix across text-show operators allowing subsequent Td positioning', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (First) Tj 0 -20 Td (Second) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'First',
      textMatrix: [1, 0, 0, 1, 72, 700],
    });
    expect(result.candidates[1]).toMatchObject({
      decodedText: 'Second',
      textMatrix: [1, 0, 0, 1, 72, 680],
    });
  });

  it('captures a single-string TJ candidate positioned by relative Td', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 Td [(Hello)] TJ ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'TJ',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 82, 680],
    });
  });

  it('rejects malformed or unanchored Td positioning', () => {
    const malformed = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 Td (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 4 Td (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (foo) -20 Td (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 NaN Td (Hello) Tj ET',
      'BT /F1 12 Tf 10 -20 Td (Hello) Tj ET',
    ];

    for (const sample of malformed) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates).toEqual([]);
    }
  });

  it('captures a Tj candidate positioned by relative TD', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 TD (Hello) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      fontSizePt: 12,
      fontResourceName: 'F1',
      textMatrix: [1, 0, 0, 1, 82, 680],
    });
  });

  it('captures a single-string TJ candidate positioned by relative TD', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 TD [(Hello)] TJ ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'TJ',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 82, 680],
    });
  });

  it('preserves the text-line matrix across text-show operators allowing subsequent TD positioning', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (First) Tj 0 -20 TD (Second) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'First',
      textMatrix: [1, 0, 0, 1, 72, 700],
    });
    expect(result.candidates[1]).toMatchObject({
      decodedText: 'Second',
      textMatrix: [1, 0, 0, 1, 72, 680],
    });
  });

  it('handles TD followed by Td cumulative positioning', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 TD 5 -10 Td (Hello) Tj ET';
    const result =
      scanExistingTextContentStream(
        stream(source),
      );

    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 87, 670],
    });
  });

  it('rejects malformed or unanchored TD positioning', () => {
    const malformed = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 TD (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 -20 4 TD (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (foo) -20 TD (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 NaN TD (Hello) Tj ET',
      'BT /F1 12 Tf 10 -20 TD (Hello) Tj ET',
    ];

    for (const sample of malformed) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates).toEqual([]);
    }
  });

  it('rejects sibling operators and unsupported text-show operators without recovering placement', () => {
    const invalidSiblings = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) \' ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 20 (Hello) " ET',
    ];

    for (const sample of invalidSiblings) {
      const result =
        scanExistingTextContentStream(
          stream(sample),
        );
      expect(result.candidates).toEqual([]);
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
