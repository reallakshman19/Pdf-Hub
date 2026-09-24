import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  scanExistingTextContentStream,
} from '../contentStreamScanner';
import {
  scanExistingTextVisualClearancePaint,
} from '../visualClearanceScanner';
import type {
  ExistingTextDecodedContentStream,
  ExistingTextSimpleTextOperator,
} from '../provenanceTypes';

function stream(
  source: string,
): ExistingTextDecodedContentStream {
  return {
    streamIndex: 0,
    streamRef: '7 0 R',
    decodedBytes:
      Uint8Array.from(
        Array.from(
          source,
          (character) =>
            character.charCodeAt(0),
        ),
      ),
  };
}

function provenance(
  source: string,
): ExistingTextSimpleTextOperator {
  const scan =
    scanExistingTextContentStream(
      stream(source),
    );
  const candidate =
    scan.candidates.find(
      (entry) =>
        entry.decodedText
        === 'Hello',
    );
  if (!candidate) {
    throw new Error(
      'Expected simple Hello provenance',
    );
  }
  return candidate;
}

const CLEARANCE = {
  x: 72,
  y: 697,
  width: 40,
  height: 15,
};

describe('existing-text visual clearance paint scanner', () => {
  it('proves one solid background rectangle plus the exact target text only', () => {
    const source =
      'q 1 1 1 rg 0 0 612 792 re f Q q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'proved',
      backgroundColorHex:
        '#ffffff',
      backgroundRectPt: {
        x: 0,
        y: 0,
        width: 612,
        height: 792,
      },
    });
  });

  it('supports explicit DeviceGray solid backgrounds', () => {
    const source =
      'q 0.5 g 0 0 612 792 re f Q q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'proved',
      backgroundColorHex:
        '#808080',
    });
  });

  it('rejects extra path paint', () => {
    const source =
      'q 1 1 1 rg 0 0 612 792 re f Q 10 10 20 20 re S q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'FOREIGN_PAINT_OPERATOR',
      ],
    });
  });

  it('rejects an additional text show', () => {
    const source =
      'q 1 1 1 rg 0 0 612 792 re f Q q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj 1 0 0 1 72 680 Tm (Other) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'EXTRA_TEXT_SHOW',
      ],
    });
  });

  it('rejects non-identity graphics transforms', () => {
    const original =
      'q 1 1 1 rg 0 0 612 792 re f Q q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const transformed =
      '2 0 0 2 0 0 cm '
      + original;

    const result =
      scanExistingTextVisualClearancePaint({
        stream:
          stream(transformed),
        provenance:
          provenance(original),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'NON_IDENTITY_TRANSFORM',
      ],
    });
  });

  it('rejects missing background paint', () => {
    const source =
      'q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'BACKGROUND_MISSING',
      ],
    });
  });

  it('rejects a background that does not cover the requested clearance', () => {
    const source =
      'q 1 1 1 rg 70 695 20 20 re f Q q BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET Q';
    const result =
      scanExistingTextVisualClearancePaint({
        stream: stream(source),
        provenance:
          provenance(source),
        clearanceRectPt:
          CLEARANCE,
      });

    expect(result).toMatchObject({
      status: 'unproved',
      reasons: [
        'BACKGROUND_DOES_NOT_COVER_CLEARANCE',
      ],
    });
  });
});
