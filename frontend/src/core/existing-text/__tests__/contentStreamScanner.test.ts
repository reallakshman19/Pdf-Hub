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

  it('handles explicit TL and T* leading advance for Tj and bounded TJ', () => {
    const sourceTj =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL T* (Hello) Tj ET';
    const resultTj = scanExistingTextContentStream(stream(sourceTj));
    expect(resultTj.complete).toBe(true);
    expect(resultTj.candidates).toHaveLength(1);
    expect(resultTj.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });

    const sourceTjArray =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL T* [(Hello)] TJ ET';
    const resultTjArray = scanExistingTextContentStream(stream(sourceTjArray));
    expect(resultTjArray.complete).toBe(true);
    expect(resultTjArray.candidates).toHaveLength(1);
    expect(resultTjArray.candidates[0]).toMatchObject({
      operator: 'TJ',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
  });

  it('handles TL before Tm positioning', () => {
    const source =
      'BT 14 TL /F1 12 Tf 1 0 0 1 72 700 Tm T* (Hello) Tj ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
  });

  it('consumes leading established by TD across subsequent T*', () => {
    const sourceTj =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0 -14 TD (First) Tj T* (Second) Tj ET';
    const resultTj = scanExistingTextContentStream(stream(sourceTj));
    expect(resultTj.complete).toBe(true);
    expect(resultTj.candidates).toHaveLength(2);
    expect(resultTj.candidates[0]).toMatchObject({
      decodedText: 'First',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(resultTj.candidates[1]).toMatchObject({
      decodedText: 'Second',
      textMatrix: [1, 0, 0, 1, 72, 672],
    });

    const sourceTJ =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0 -14 TD [(First)] TJ T* (Second) Tj ET';
    const resultTJ = scanExistingTextContentStream(stream(sourceTJ));
    expect(resultTJ.complete).toBe(true);
    expect(resultTJ.candidates).toHaveLength(2);
    expect(resultTJ.candidates[0]).toMatchObject({
      decodedText: 'First',
      operator: 'TJ',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(resultTJ.candidates[1]).toMatchObject({
      decodedText: 'Second',
      operator: 'Tj',
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('respects leading override where TL overrides previous TD', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0 -14 TD 20 TL T* (Hello) Tj ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 72, 666],
    });
  });

  it('preserves leading across intermediate Td movements', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 -5 Td T* (Hello) Tj ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'Hello',
      textMatrix: [1, 0, 0, 1, 82, 681],
    });
  });

  it('handles repeated T* advances across multiple text shows', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL T* (First) Tj T* (Second) Tj ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'First',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(result.candidates[1]).toMatchObject({
      decodedText: 'Second',
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('rejects malformed TL assignments fail-closed', () => {
    const malformed = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm TL T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 20 TL T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (foo) TL T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm NaN TL T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm Infinity TL T* (Hello) Tj ET',
    ];

    for (const sample of malformed) {
      const result = scanExistingTextContentStream(stream(sample));
      expect(result.candidates).toEqual([]);
    }
  });

  it('rejects invalid T* consumption fail-closed', () => {
    const invalid = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm T* (Hello) Tj ET',
      'BT /F1 12 Tf 14 TL T* (Hello) Tj ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 T* (Hello) Tj ET',
      'BT /F1 12 Tf 2 0 0 2 72 700 Tm 14 TL T* (Hello) Tj ET',
    ];

    for (const sample of invalid) {
      const result = scanExistingTextContentStream(stream(sample));
      expect(result.candidates).toEqual([]);
    }
  });

  it('rejects quote operators without defined leading fail-closed', () => {
    const unanchored = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) \' ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 10 20 (Hello) " ET',
    ];

    for (const sample of unanchored) {
      const result = scanExistingTextContentStream(stream(sample));
      expect(result.candidates).toEqual([]);
    }
  });

  it('rejects malformed quote operators fail-closed', () => {
    const malformed = [
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 (Hello) \' ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL (Hello) (Extra) \' ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 (Hello) " ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL NaN 20 (Hello) " ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 Infinity (Hello) " ET',
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 10 20 30 (Hello) " ET',
    ];

    for (const sample of malformed) {
      const result = scanExistingTextContentStream(stream(sample));
      expect(result.candidates).toEqual([]);
    }
  });

  it('handles single-quote (\') text show with leading advance', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL (Hello) \' ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: "'",
      decodedText: 'Hello',
      fontResourceName: 'F1',
      fontSizePt: 12,
      charSpacingPt: 0,
      wordSpacingPt: 0,
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
  });

  it('handles consecutive single-quote (\' -> \') advances', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL (Line 1) \' (Line 2) \' ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      operator: "'",
      decodedText: 'Line 1',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(result.candidates[1]).toMatchObject({
      operator: "'",
      decodedText: 'Line 2',
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('handles double-quote (") setting wordSpacing, charSpacing, and line advance', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 2.5 0.75 (Hello) " ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      operator: '"',
      decodedText: 'Hello',
      fontResourceName: 'F1',
      fontSizePt: 12,
      charSpacingPt: 0.75,
      wordSpacingPt: 2.5,
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
  });

  it('persists spacing across compound sequences: " -> \' and " -> "', () => {
    const source1 =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 2 0.5 (Line 1) " (Line 2) \' ET';
    const result1 = scanExistingTextContentStream(stream(source1));
    expect(result1.complete).toBe(true);
    expect(result1.candidates).toHaveLength(2);
    expect(result1.candidates[0]).toMatchObject({
      operator: '"',
      decodedText: 'Line 1',
      charSpacingPt: 0.5,
      wordSpacingPt: 2,
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(result1.candidates[1]).toMatchObject({
      operator: "'",
      decodedText: 'Line 2',
      charSpacingPt: 0.5,
      wordSpacingPt: 2,
      textMatrix: [1, 0, 0, 1, 72, 672],
    });

    const source2 =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 2 0.5 (Line 1) " 3 1 (Line 2) " ET';
    const result2 = scanExistingTextContentStream(stream(source2));
    expect(result2.complete).toBe(true);
    expect(result2.candidates).toHaveLength(2);
    expect(result2.candidates[0]).toMatchObject({
      operator: '"',
      decodedText: 'Line 1',
      charSpacingPt: 0.5,
      wordSpacingPt: 2,
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(result2.candidates[1]).toMatchObject({
      operator: '"',
      decodedText: 'Line 2',
      charSpacingPt: 1,
      wordSpacingPt: 3,
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('respects explicit Tc/Tw override after double quote', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 14 TL 2 0.5 (Line 1) " 0 Tc 0 Tw (Line 2) \' ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      operator: '"',
      decodedText: 'Line 1',
      charSpacingPt: 0.5,
      wordSpacingPt: 2,
    });
    expect(result.candidates[1]).toMatchObject({
      operator: "'",
      decodedText: 'Line 2',
      charSpacingPt: 0,
      wordSpacingPt: 0,
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('consumes leading established by TD across subsequent single quote: TD -> show -> \'', () => {
    const source =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0 -14 TD (First) Tj (Second) \' ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'First',
      textMatrix: [1, 0, 0, 1, 72, 686],
    });
    expect(result.candidates[1]).toMatchObject({
      operator: "'",
      decodedText: 'Second',
      textMatrix: [1, 0, 0, 1, 72, 672],
    });
  });

  it('carries active Tc and Tw state into Tj and bounded TJ candidates', () => {
    const sourceTj =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0.5 Tc 1.5 Tw (Hello Spaced) Tj ET';
    const resultTj = scanExistingTextContentStream(stream(sourceTj));
    expect(resultTj.complete).toBe(true);
    expect(resultTj.candidates).toHaveLength(1);
    expect(resultTj.candidates[0]).toMatchObject({
      operator: 'Tj',
      decodedText: 'Hello Spaced',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });

    const sourceTjArray =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0.5 Tc 1.5 Tw [(Hello Spaced)] TJ ET';
    const resultTjArray = scanExistingTextContentStream(stream(sourceTjArray));
    expect(resultTjArray.complete).toBe(true);
    expect(resultTjArray.candidates).toHaveLength(1);
    expect(resultTjArray.candidates[0]).toMatchObject({
      operator: 'TJ',
      decodedText: 'Hello Spaced',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });
  });

  it('persists Tc/Tw set outside BT and across ET -> BT objects', () => {
    const beforeBt =
      '0.5 Tc 1.5 Tw BT /F1 12 Tf 1 0 0 1 72 700 Tm (From Outside) Tj ET';
    const resultBefore = scanExistingTextContentStream(stream(beforeBt));
    expect(resultBefore.complete).toBe(true);
    expect(resultBefore.candidates).toHaveLength(1);
    expect(resultBefore.candidates[0]).toMatchObject({
      decodedText: 'From Outside',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });

    const acrossEt =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm 0.5 Tc 1.5 Tw (First Block) Tj ET '
      + 'BT /F1 12 Tf 1 0 0 1 72 650 Tm (Second Block) Tj ET';
    const resultAcross = scanExistingTextContentStream(stream(acrossEt));
    expect(resultAcross.complete).toBe(true);
    expect(resultAcross.candidates).toHaveLength(2);
    expect(resultAcross.candidates[0]).toMatchObject({
      decodedText: 'First Block',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });
    expect(resultAcross.candidates[1]).toMatchObject({
      decodedText: 'Second Block',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });
  });

  it('saves and restores spacing state with q and Q', () => {
    const source =
      '0.5 Tc 1.5 Tw '
      + 'q '
      + '2.0 Tc 3.0 Tw '
      + 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Inner) Tj ET '
      + 'Q '
      + 'BT /F1 12 Tf 1 0 0 1 72 650 Tm (Restored) Tj ET';
    const result = scanExistingTextContentStream(stream(source));
    expect(result.complete).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      decodedText: 'Inner',
      charSpacingPt: 2.0,
      wordSpacingPt: 3.0,
    });
    expect(result.candidates[1]).toMatchObject({
      decodedText: 'Restored',
      charSpacingPt: 0.5,
      wordSpacingPt: 1.5,
    });
  });

  it('rejects malformed Tc/Tw fail-closed and recovers only when re-proven', () => {
    const malformedTc =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm NaN Tc (Bad) Tj ET';
    const resultBad = scanExistingTextContentStream(stream(malformedTc));
    expect(resultBad.candidates).toEqual([]);

    const recovered =
      'BT /F1 12 Tf 1 0 0 1 72 700 Tm NaN Tc (Bad) Tj 1.0 Tc 1 0 0 1 72 650 Tm (Good) Tj ET';
    const resultGood = scanExistingTextContentStream(stream(recovered));
    expect(resultGood.candidates).toHaveLength(1);
    expect(resultGood.candidates[0]).toMatchObject({
      decodedText: 'Good',
      charSpacingPt: 1.0,
      wordSpacingPt: 0,
    });
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
