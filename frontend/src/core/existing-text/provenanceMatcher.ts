import {
  isSimpleTextMatrix,
  parsePdfContentStreams,
  readNumericMatrix,
  type PdfContentStreamAST,
  type PdfContentTransform,
} from '@/core/pdf-content-stream';
import {
  scanExistingTextContentStream,
} from './contentStreamScanner';
import {
  normalizeExistingTextForMatch,
} from './fontDecoding';
import {
  walkExistingTextPageSpaceShows,
  type ExistingTextPageSpaceCandidate,
} from './pageSpaceTextWalker';
import type {
  ExistingTextContentStreamReadResult,
  ExistingTextProvenanceMatchInput,
  ExistingTextProvenanceMatchResult,
  ExistingTextSimpleStringEncoding,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';
import type {
  ExistingTextSpan,
} from './types';

const VALUE_TOLERANCE_PT = 0.05;

export function matchExistingTextSpanToContentStream(
  input:
    ExistingTextProvenanceMatchInput,
): ExistingTextProvenanceMatchResult {
  const { span, content } =
    input;

  if (
    span.editability
    !== 'native-replacement-candidate'
    && !span.reasons.includes('ROTATED_TEXT')
  ) {
    return unmapped(
      span,
      'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE',
      0,
      [],
    );
  }

  if (!content.complete) {
    return unmapped(
      span,
      'INCOMPLETE_CONTENT_STREAM_SET',
      0,
      content.diagnostics.map(
        (diagnostic) =>
          diagnostic.message,
      ),
    );
  }

  if (
    !isSpanInsideSimpleSubset(
      span,
    )
  ) {
    return unmapped(
      span,
      'SPAN_OUTSIDE_SIMPLE_TEXT_SUBSET',
      0,
      [],
    );
  }

  const candidates:
    ExistingTextSimpleTextOperator[] = [];
  const diagnostics: string[] = [];
  let singleStreamScanFailed = false;

  for (
    const stream
    of content.streams
  ) {
    const scan =
      scanExistingTextContentStream(
        stream,
      );
    diagnostics.push(
      ...scan.diagnostics.map(
        (message) =>
          `stream ${stream.streamIndex}: ${message}`,
      ),
    );
    if (!scan.complete) {
      singleStreamScanFailed = true;
      break;
    }

    candidates.push(
      ...scan.candidates.filter(
        (candidate) =>
          candidateMatchesSpan(
            candidate,
            span,
          ),
      ),
    );
  }

  const astResult = parsePdfContentStreams(
    content.streams.map((s) => ({
      streamIndex: s.streamIndex,
      streamRef: s.streamRef,
      decodedBytes: s.decodedBytes,
    })),
  );

  // If isolated single-stream scanning failed (e.g. cross-stream q/Q or §8.4.1 page teardown),
  // re-parse with the multi-stream ISO 32000-1 AST engine before failing closed.
  let exactCandidates: ExistingTextSimpleTextOperator[] | null =
    candidates;
  if (singleStreamScanFailed) {
    exactCandidates = astResult.complete
      ? buildCandidatesFromAst(astResult, content).filter((c) =>
          candidateMatchesSpan(c, span),
        )
      : null;
  }

  if (exactCandidates && exactCandidates.length > 1) {
    return unmapped(
      span,
      'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
      exactCandidates.length,
      diagnostics,
    );
  }

  if (exactCandidates && exactCandidates.length === 1) {
    return {
      status: 'matched',
      spanId: span.id,
      provenance: exactCandidates[0],
    };
  }

  // Page-space fallback: replay CTM, text state, spacing and advances, and
  // decode strings through the page fonts, so real-world streams (cm, scaled
  // Tm, Tc/Tw/Tz, kerned TJ, several shows per BT) can still map uniquely.
  if (!astResult.complete) {
    return unmapped(
      span,
      exactCandidates === null
        ? 'UNSUPPORTED_CONTENT_STREAM_SYNTAX'
        : 'NO_SIMPLE_TEXT_OPERATOR_MATCH',
      0,
      diagnostics,
    );
  }

  const streamRefs = new Map(
    content.streams.map((s) => [s.streamIndex, s.streamRef] as const),
  );
  const pageSpaceMatches = walkExistingTextPageSpaceShows(
    astResult,
    streamRefs,
    content.fontDecoders,
  ).filter((candidate) => pageSpaceCandidateMatchesSpan(candidate, span));

  if (pageSpaceMatches.length > 1) {
    return unmapped(
      span,
      'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
      pageSpaceMatches.length,
      diagnostics,
    );
  }
  if (pageSpaceMatches.length === 1) {
    return {
      status: 'matched',
      spanId: span.id,
      provenance: {
        ...pageSpaceMatches[0].provenance,
        // Normalised-equal to the operator text; downstream identity checks bind to span text.
        decodedText: span.text,
      },
    };
  }

  return unmapped(
    span,
    'NO_SIMPLE_TEXT_OPERATOR_MATCH',
    0,
    diagnostics,
  );
}

function pageSpaceCandidateMatchesSpan(
  candidate: ExistingTextPageSpaceCandidate,
  span: ExistingTextSpan,
): boolean {
  const spanText = normalizeExistingTextForMatch(span.text);
  if (
    spanText.length === 0
    || normalizeExistingTextForMatch(candidate.text) !== spanText
  ) {
    return false;
  }
  return candidate.renderMatrix.every((value, index) =>
    nearlyEqual(value, span.transform[index]),
  );
}

function candidateMatchesSpan(
  candidate:
    ExistingTextSimpleTextOperator,
  span: ExistingTextSpan,
): boolean {
  const matrix =
    candidate.textMatrix;

  return (
    candidate.decodedText
      === span.text
    && nearlyEqual(
      candidate.fontSizePt,
      span.fontSizePt,
    )
    && nearlyEqual(
      matrix[4],
      span.originPt.x,
    )
    && nearlyEqual(
      matrix[5],
      span.originPt.y,
    )
  );
}

function isSpanInsideSimpleSubset(
  span: ExistingTextSpan,
): boolean {
  const [
    a,
    b,
    c,
    d,
  ] = span.transform;
  const direction =
    span.direction
      ?.toLowerCase();

  const isAcceptableReason =
    span.reasons.length === 0
    || (span.reasons.length === 1 && span.reasons[0] === 'ROTATED_TEXT');

  if (
    !isAcceptableReason
    || !span.fontName?.trim()
    || (direction !== undefined && direction !== 'ltr')
  ) {
    return false;
  }

  if (
    !nearlyEqual(span.originPt.x, span.transform[4])
    || !nearlyEqual(span.originPt.y, span.transform[5])
  ) {
    return false;
  }

  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);

  if (
    !nearlyEqual(span.horizontalScalePt, scaleX)
    || !nearlyEqual(span.fontSizePt, scaleY)
  ) {
    return false;
  }

  // Orthogonality: a*c + b*d === 0
  if (!nearlyEqual(a * c + b * d, 0)) {
    return false;
  }

  // Positive determinant
  if (a * d - b * c <= 0) {
    return false;
  }

  // Uniform scale
  if (!nearlyEqual(scaleX, scaleY)) {
    return false;
  }

  return true;
}

function unmapped(
  span: ExistingTextSpan,
  reason:
    Extract<
      ExistingTextProvenanceMatchResult,
      { status: 'unmapped' }
    >['reason'],
  candidateCount: number,
  diagnostics: string[],
): ExistingTextProvenanceMatchResult {
  return {
    status: 'unmapped',
    spanId: span.id,
    reason,
    candidateCount,
    diagnostics,
  };
}

function nearlyEqual(
  left: number,
  right: number,
): boolean {
  return (
    Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(
      left - right,
    ) <= VALUE_TOLERANCE_PT
  );
}

function buildCandidatesFromAst(
  astResult: PdfContentStreamAST,
  content: ExistingTextContentStreamReadResult,
): ExistingTextSimpleTextOperator[] {
  const candidates: ExistingTextSimpleTextOperator[] = [];

  // Track 1-based operator index per stream to match contentStreamScanner exactly
  const streamOpIndices = new Map<number, number>();

  let inTextObject = false;
  let fontResourceName: string | null = null;
  let fontSizePt: number | null = null;
  let textMatrix: PdfContentTransform = [1, 0, 0, 1, 0, 0];
  let textLineMatrix: PdfContentTransform = [1, 0, 0, 1, 0, 0];
  let textLeadingPt: number | null = null;
  let placementSafe = true;
  let styleSafe = true;

  for (const op of astResult.operations) {
    const streamOpIndex = (streamOpIndices.get(op.streamIndex) ?? 0) + 1;
    streamOpIndices.set(op.streamIndex, streamOpIndex);

    const streamRef =
      content.streams.find((s) => s.streamIndex === op.streamIndex)?.streamRef ?? null;

    switch (op.operator) {
      case 'BT':
        inTextObject = true;
        fontResourceName = null;
        fontSizePt = null;
        textMatrix = [1, 0, 0, 1, 0, 0];
        textLineMatrix = [1, 0, 0, 1, 0, 0];
        textLeadingPt = null;
        placementSafe = true;
        styleSafe = true;
        break;

      case 'ET':
        inTextObject = false;
        break;

      case 'Tf': {
        if (inTextObject && op.operands.length >= 2) {
          const fontOp = op.operands[op.operands.length - 2];
          const sizeOp = op.operands[op.operands.length - 1];
          if (
            fontOp.kind === 'name' &&
            sizeOp.kind === 'number' &&
            sizeOp.value > 0
          ) {
            fontResourceName = fontOp.name;
            fontSizePt = sizeOp.value;
          } else {
            styleSafe = false;
          }
        }
        break;
      }

      case 'Tm': {
        if (!inTextObject) break;
        const matrix = readNumericMatrix(op.operands);
        if (matrix && isSimpleTextMatrix(matrix)) {
          textMatrix = matrix;
          textLineMatrix = matrix;
          placementSafe = true;
        } else {
          placementSafe = false;
        }
        break;
      }

      case 'Td':
      case 'TD': {
        if (inTextObject && op.operands.length >= 2) {
          const txOp = op.operands[op.operands.length - 2];
          const tyOp = op.operands[op.operands.length - 1];
          if (txOp.kind === 'number' && tyOp.kind === 'number') {
            const [a, b, c, d, e, f] = textLineMatrix;
            const newLineMatrix: PdfContentTransform = [
              a,
              b,
              c,
              d,
              e + txOp.value,
              f + tyOp.value,
            ];
            textLineMatrix = newLineMatrix;
            textMatrix = newLineMatrix;
            placementSafe = isSimpleTextMatrix(newLineMatrix);
            if (op.operator === 'TD') {
              textLeadingPt = -tyOp.value;
            }
          } else {
            placementSafe = false;
          }
        }
        break;
      }

      case 'T*': {
        if (inTextObject && textLeadingPt !== null) {
          const [a, b, c, d, e, f] = textLineMatrix;
          const newLineMatrix: PdfContentTransform = [
            a,
            b,
            c,
            d,
            e,
            f - textLeadingPt,
          ];
          textLineMatrix = newLineMatrix;
          textMatrix = newLineMatrix;
          placementSafe = isSimpleTextMatrix(newLineMatrix);
        } else if (inTextObject) {
          placementSafe = false;
        }
        break;
      }

      case 'Tj': {
        if (
          inTextObject &&
          placementSafe &&
          styleSafe &&
          fontResourceName &&
          fontSizePt &&
          op.operands.length === 1
        ) {
          const operand = op.operands[0];
          let text = '';
          let encoding: ExistingTextSimpleStringEncoding = 'ascii-literal';

          if (operand.kind === 'literal-string') {
            text = operand.decodedText ?? operand.raw.slice(1, -1);
            encoding = 'ascii-literal';
          } else if (operand.kind === 'hex-string') {
            text = operand.decodedText ?? '';
            encoding = 'ascii-hex';
          }

          if (text.length > 0) {
            candidates.push({
              operator: 'Tj',
              streamIndex: op.streamIndex,
              streamRef,
              operatorIndex: streamOpIndex,
              operatorRange: {
                start: (op.rawEnd ?? 0) - op.operator.length,
                end: op.rawEnd ?? 0,
              },
              operandRange: {
                start: operand.rawStart ?? 0,
                end: operand.rawEnd ?? 0,
              },
              decodedText: text,
              encoding,
              fontResourceName,
              fontSizePt,
              textMatrix: [...textMatrix],
            });
          }
          // A text-show operator advances the current text matrix without explicit Tm
          placementSafe = false;
        }
        break;
      }

      case 'TJ': {
        if (
          inTextObject &&
          placementSafe &&
          styleSafe &&
          fontResourceName &&
          fontSizePt &&
          op.operands.length === 1
        ) {
          const operand = op.operands[0];
          if (operand.kind === 'array' && operand.items.length === 1) {
            const single = operand.items[0];
            let text = '';
            let encoding: ExistingTextSimpleStringEncoding = 'ascii-literal';

            if (single.kind === 'literal-string') {
              text = single.decodedText ?? single.raw.slice(1, -1);
              encoding = 'ascii-literal';
            } else if (single.kind === 'hex-string') {
              text = single.decodedText ?? '';
              encoding = 'ascii-hex';
            }

            if (text.length > 0) {
              candidates.push({
                operator: 'TJ',
                streamIndex: op.streamIndex,
                streamRef,
                operatorIndex: streamOpIndex,
                operatorRange: {
                  start: (op.rawEnd ?? 0) - op.operator.length,
                  end: op.rawEnd ?? 0,
                },
                operandRange: {
                  start: single.rawStart ?? 0,
                  end: single.rawEnd ?? 0,
                },
                arrayRange: {
                  start: operand.rawStart ?? 0,
                  end: operand.rawEnd ?? 0,
                },
                decodedText: text,
                encoding,
                fontResourceName,
                fontSizePt,
                textMatrix: [...textMatrix],
              });
            }
            placementSafe = false;
          }
        }
        break;
      }
    }
  }

  return candidates;
}
