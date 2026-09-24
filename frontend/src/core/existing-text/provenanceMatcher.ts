import {
  scanExistingTextContentStream,
} from './contentStreamScanner';
import type {
  ExistingTextProvenanceMatchInput,
  ExistingTextProvenanceMatchResult,
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
      return unmapped(
        span,
        'UNSUPPORTED_CONTENT_STREAM_SYNTAX',
        0,
        diagnostics,
      );
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

  if (candidates.length === 0) {
    return unmapped(
      span,
      'NO_SIMPLE_TEXT_OPERATOR_MATCH',
      0,
      diagnostics,
    );
  }

  if (candidates.length > 1) {
    return unmapped(
      span,
      'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH',
      candidates.length,
      diagnostics,
    );
  }

  return {
    status: 'matched',
    spanId: span.id,
    provenance:
      candidates[0],
  };
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

  return (
    span.reasons.length === 0
    && Boolean(
      span.fontName?.trim(),
    )
    && (
      direction === undefined
      || direction === 'ltr'
    )
    && nearlyEqual(
      span.originPt.x,
      span.transform[4],
    )
    && nearlyEqual(
      span.originPt.y,
      span.transform[5],
    )
    && nearlyEqual(
      span.horizontalScalePt,
      Math.hypot(a, b),
    )
    && nearlyEqual(
      span.fontSizePt,
      Math.hypot(c, d),
    )
    && nearlyEqual(
      b,
      0,
    )
    && nearlyEqual(
      c,
      0,
    )
    && nearlyEqual(
      a,
      span.fontSizePt,
    )
    && nearlyEqual(
      d,
      span.fontSizePt,
    )
  );
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
