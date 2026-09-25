import {
  existingTextBytesToLatin1,
  lexExistingTextContentStream,
  scanExistingTextContentStream,
  type ExistingTextContentToken,
} from './contentStreamScanner';
import type {
  ExistingTextFitRect,
} from './fitTypes';
import type {
  ExistingTextDecodedContentStream,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';
import type {
  ExistingTextPaintProgramScanResult,
  ExistingTextVisualClearanceUnprovedReason,
} from './visualClearanceTypes';

interface PaintGraphicsState {
  fillColorHex: string;
}

interface BackgroundPaint {
  rect: ExistingTextFitRect;
  colorHex: string;
  operatorIndex: number;
}

const MATRIX_TOLERANCE = 1e-9;

export function scanExistingTextVisualClearancePaint(
  input: {
    stream:
      ExistingTextDecodedContentStream;
    provenance:
      ExistingTextSimpleTextOperator;
    clearanceRectPt:
      ExistingTextFitRect;
  },
): ExistingTextPaintProgramScanResult {
  const provenanceScan =
    scanExistingTextContentStream(
      input.stream,
    );
  if (!provenanceScan.complete) {
    return unproved(
      'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
      provenanceScan.diagnostics,
    );
  }

  if (
    !validRect(
      input.clearanceRectPt,
    )
  ) {
    return unproved(
      'CLEARANCE_GEOMETRY_INVALID',
      [
        'The requested clearance rectangle is non-finite or non-positive.',
      ],
    );
  }

  const lexed =
    lexExistingTextContentStream(
      existingTextBytesToLatin1(
        input.stream.decodedBytes,
      ),
    );
  if (!lexed.complete) {
    return unproved(
      'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
      lexed.diagnostics,
    );
  }

  const operands:
    ExistingTextContentToken[] = [];
  const graphicsStack:
    PaintGraphicsState[] = [];
  let graphics:
    PaintGraphicsState = {
      // PDF graphics state defaults nonstroking DeviceGray to 0 (black).
      fillColorHex: '#000000',
    };
  let background:
    BackgroundPaint | null = null;
  let pendingRect:
    ExistingTextFitRect | null = null;
  let operatorIndex = 0;
  let targetSeen = 0;
  let targetTextColorHex:
    string | null = null;

  for (const token of lexed.tokens) {
    if (token.kind !== 'word') {
      operands.push(token);
      continue;
    }

    const operator = token.raw;
    operatorIndex += 1;

    switch (operator) {
      case 'q':
        graphicsStack.push({
          ...graphics,
        });
        break;

      case 'Q': {
        const restored =
          graphicsStack.pop();
        if (!restored) {
          return unproved(
            'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
            [
              'Graphics-state restore Q has no matching q.',
            ],
          );
        }
        graphics = restored;
        pendingRect = null;
        break;
      }

      case 'cm': {
        const matrix =
          numericTail(
            operands,
            6,
          );
        if (
          !matrix
          || !isIdentityMatrix(
            matrix,
          )
        ) {
          return unproved(
            'NON_IDENTITY_TRANSFORM',
            [
              'Visual-clearance proof only admits identity cm transforms.',
            ],
          );
        }
        break;
      }

      case 'rg': {
        const rgb =
          numericTail(
            operands,
            3,
          );
        const color =
          rgb
            ? rgbToHex(rgb)
            : null;
        if (!color) {
          return unproved(
            'BACKGROUND_COLOR_UNSUPPORTED',
            [
              'DeviceRGB fill color is malformed or outside 0..1.',
            ],
          );
        }
        graphics = {
          ...graphics,
          fillColorHex: color,
        };
        break;
      }

      case 'g': {
        const gray =
          numericTail(
            operands,
            1,
          );
        const color =
          gray
            ? grayToHex(
                gray[0],
              )
            : null;
        if (!color) {
          return unproved(
            'BACKGROUND_COLOR_UNSUPPORTED',
            [
              'DeviceGray fill color is malformed or outside 0..1.',
            ],
          );
        }
        graphics = {
          ...graphics,
          fillColorHex: color,
        };
        break;
      }

      case 're': {
        if (pendingRect) {
          return unproved(
            'BACKGROUND_AMBIGUOUS',
            [
              'Multiple rectangle subpaths are not admitted by the simple background proof.',
            ],
          );
        }
        const rect =
          numericTail(
            operands,
            4,
          );
        if (!rect) {
          return unproved(
            'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
            [
              'Rectangle operator re does not have four finite numeric operands.',
            ],
          );
        }
        const [
          x,
          y,
          width,
          height,
        ] = rect;
        const candidate = {
          x,
          y,
          width,
          height,
        };
        if (!validRect(candidate)) {
          return unproved(
            'CLEARANCE_GEOMETRY_INVALID',
            [
              'Background rectangle is non-finite or non-positive.',
            ],
          );
        }
        pendingRect = candidate;
        break;
      }

      case 'f':
      case 'f*': {
        if (
          !pendingRect
          || !graphics.fillColorHex
        ) {
          return unproved(
            'FOREIGN_PAINT_OPERATOR',
            [
              'A fill paint occurred without one admitted solid rectangle/color pair.',
            ],
          );
        }
        if (background) {
          return unproved(
            'BACKGROUND_AMBIGUOUS',
            [
              'More than one path fill is present; foreign paint cannot be excluded.',
            ],
          );
        }
        background = {
          rect: pendingRect,
          colorHex:
            graphics.fillColorHex,
          operatorIndex,
        };
        pendingRect = null;
        break;
      }

      case 'Tj': {
        const isTarget =
          operatorIndex
            === input.provenance
              .operatorIndex
          && token.rawStart
            === input.provenance
              .operatorRange.start
          && token.rawEnd
            === input.provenance
              .operatorRange.end;
        if (!isTarget) {
          return unproved(
            'EXTRA_TEXT_SHOW',
            [
              `Unexpected text-show operator at operator index ${operatorIndex}.`,
            ],
          );
        }
        targetSeen += 1;
        targetTextColorHex =
          graphics.fillColorHex;
        break;
      }

      case 'TJ':
      case "'":
      case '"':
        return unproved(
          'EXTRA_TEXT_SHOW',
          [
            `Unsupported additional text-show operator ${operator}.`,
          ],
        );

      case 'S':
      case 's':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
      case 'm':
      case 'l':
      case 'c':
      case 'v':
      case 'y':
      case 'h':
      case 'Do':
      case 'sh':
      case 'BI':
      case 'ID':
      case 'EI':
        return unproved(
          'FOREIGN_PAINT_OPERATOR',
          [
            `Foreign/unsupported paint operator ${operator} is present.`,
          ],
        );

      case 'W':
      case 'W*':
        return unproved(
          'CLIPPING_UNSUPPORTED',
          [
            `Clipping operator ${operator} is not admitted by the simple clearance proof.`,
          ],
        );

      case 'gs':
      case 'CS':
      case 'cs':
      case 'SC':
      case 'SCN':
      case 'sc':
      case 'scn':
      case 'K':
      case 'k':
      case 'Tr':
        return unproved(
          'UNSUPPORTED_GRAPHICS_STATE',
          [
            `Graphics/color operator ${operator} can alter paint semantics outside the admitted proof subset.`,
          ],
        );

      case 'n':
        pendingRect = null;
        break;

      case 'BT':
      case 'ET':
      case 'Tf':
      case 'Tm':
      case 'Td':
      case 'TD':
      case 'T*':
      case 'TL':
      case 'w':
      case 'J':
      case 'j':
      case 'M':
      case 'd':
      case 'ri':
      case 'i':
      case 'G':
      case 'RG':
      case 'BMC':
      case 'BDC':
      case 'EMC':
      case 'MP':
      case 'DP':
        break;

      default:
        return unproved(
          'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
          [
            `Operator ${operator} is outside the admitted simple clearance grammar.`,
          ],
        );
    }

    operands.length = 0;
  }

  const exactCandidates =
    provenanceScan.candidates.filter(
      (candidate) =>
        sameProvenance(
          candidate,
          input.provenance,
        ),
    );
  if (exactCandidates.length !== 1) {
    return unproved(
      'TARGET_PROVENANCE_MISMATCH',
      [
        `Expected exactly one exact target provenance match, found ${exactCandidates.length}.`,
      ],
    );
  }

  if (graphicsStack.length !== 0) {
    return unproved(
      'CONTENT_STREAM_SYNTAX_UNSUPPORTED',
      [
        'Unbalanced q/Q graphics-state operators.',
      ],
    );
  }
  if (targetSeen !== 1) {
    return unproved(
      'TARGET_PROVENANCE_MISMATCH',
      [
        `Expected target text show exactly once, saw ${targetSeen}.`,
      ],
    );
  }
  if (!targetTextColorHex) {
    return unproved(
      'BACKGROUND_COLOR_UNSUPPORTED',
      [
        'The effective target text fill color could not be proved.',
      ],
    );
  }

  if (!background) {
    return unproved(
      'BACKGROUND_MISSING',
      [
        'No explicit solid rectangle background fill was proved.',
      ],
    );
  }
  if (
    background.operatorIndex
      >= input.provenance
        .operatorIndex
  ) {
    return unproved(
      'BACKGROUND_AMBIGUOUS',
      [
        'The admitted background must be painted before the target text.',
      ],
    );
  }
  if (
    !containsRect(
      background.rect,
      input.clearanceRectPt,
    )
  ) {
    return unproved(
      'BACKGROUND_DOES_NOT_COVER_CLEARANCE',
      [
        'The explicit solid background rectangle does not contain the requested clearance envelope.',
      ],
    );
  }

  return {
    status: 'proved',
    operatorCount: operatorIndex,
    targetOperatorIndex:
      input.provenance.operatorIndex,
    backgroundPaintOperatorIndex:
      background.operatorIndex,
    backgroundRectPt: {
      ...background.rect,
    },
    backgroundColorHex:
      background.colorHex,
    targetTextColorHex,
  };
}

function numericTail(
  operands:
    readonly ExistingTextContentToken[],
  count: number,
): number[] | null {
  if (operands.length < count) {
    return null;
  }
  const tail =
    operands.slice(-count);
  if (
    tail.some(
      (token) =>
        token.kind !== 'number'
        || !Number.isFinite(
          token.numberValue,
        ),
    )
  ) {
    return null;
  }
  return tail.map(
    (token) =>
      token.numberValue
      ?? Number.NaN,
  );
}

function isIdentityMatrix(
  values: readonly number[],
): boolean {
  return (
    values.length === 6
    && nearlyEqual(values[0], 1)
    && nearlyEqual(values[1], 0)
    && nearlyEqual(values[2], 0)
    && nearlyEqual(values[3], 1)
    && nearlyEqual(values[4], 0)
    && nearlyEqual(values[5], 0)
  );
}

function nearlyEqual(
  left: number,
  right: number,
): boolean {
  return Math.abs(left - right)
    <= MATRIX_TOLERANCE;
}

function rgbToHex(
  values: readonly number[],
): string | null {
  if (
    values.length !== 3
    || values.some(
      (value) =>
        !Number.isFinite(value)
        || value < 0
        || value > 1,
    )
  ) {
    return null;
  }
  return `#${values
    .map(channelHex)
    .join('')}`;
}

function grayToHex(
  value: number,
): string | null {
  if (
    !Number.isFinite(value)
    || value < 0
    || value > 1
  ) {
    return null;
  }
  const channel =
    channelHex(value);
  return `#${channel}${channel}${channel}`;
}

function channelHex(
  value: number,
): string {
  return Math.round(
    value * 255,
  ).toString(16)
    .padStart(2, '0');
}

function validRect(
  rect: ExistingTextFitRect,
): boolean {
  return (
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0
  );
}

function containsRect(
  outer: ExistingTextFitRect,
  inner: ExistingTextFitRect,
): boolean {
  const epsilon = 1e-9;
  return (
    inner.x
      >= outer.x - epsilon
    && inner.y
      >= outer.y - epsilon
    && inner.x + inner.width
      <= outer.x
        + outer.width
        + epsilon
    && inner.y + inner.height
      <= outer.y
        + outer.height
        + epsilon
  );
}

function sameProvenance(
  current:
    ExistingTextSimpleTextOperator,
  expected:
    ExistingTextSimpleTextOperator,
): boolean {
  return (
    current.streamIndex
      === expected.streamIndex
    && current.streamRef
      === expected.streamRef
    && current.operatorIndex
      === expected.operatorIndex
    && current.operator
      === expected.operator
    && current.operatorRange.start
      === expected.operatorRange.start
    && current.operatorRange.end
      === expected.operatorRange.end
    && current.operandRange.start
      === expected.operandRange.start
    && current.operandRange.end
      === expected.operandRange.end
    && current.decodedText
      === expected.decodedText
    && current.encoding
      === expected.encoding
    && current.fontResourceName
      === expected.fontResourceName
    && current.fontSizePt
      === expected.fontSizePt
    && current.textMatrix.every(
      (value, index) =>
        value
        === expected.textMatrix[
          index
        ],
    )
  );
}

function unproved(
  reason:
    ExistingTextVisualClearanceUnprovedReason,
  diagnostics: string[],
): ExistingTextPaintProgramScanResult {
  return {
    status: 'unproved',
    reasons: [reason],
    diagnostics,
  };
}
