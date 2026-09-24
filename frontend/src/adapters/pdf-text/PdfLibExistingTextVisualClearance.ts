import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import {
  validateExistingTextEditIntentAgainstSpan,
} from '@/core/existing-text/model';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import type {
  ExistingTextSimpleTextOperator,
} from '@/core/existing-text/provenanceTypes';
import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from '@/core/existing-text/types';
import type {
  ExistingTextFitRect,
} from '@/core/existing-text/fitTypes';
import type {
  ExistingTextVisualClearanceAnalysisResult,
  ExistingTextVisualClearanceUnprovedReason,
} from '@/core/existing-text/visualClearanceTypes';
import {
  scanExistingTextVisualClearancePaint,
} from '@/core/existing-text/visualClearanceScanner';
import {
  ExistingTextReplacementError,
} from '@/core/existing-text/replacementError';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  readExistingTextPageContentStreamsFromDocument,
} from './PdfLibExistingTextContentStreams';
import {
  measureExistingTextNativeFit,
} from './PdfLibExistingTextFit';
import {
  resolveExistingTextStandard14BaseFont,
} from './PdfLibExistingTextFont';

export async function analyzeExistingTextVisualClearance(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    span: ExistingTextSpan;
    intent: ExistingTextEditIntent;
    provenance:
      ExistingTextSimpleTextOperator;
    signal?: AbortSignal;
  },
): Promise<ExistingTextVisualClearanceAnalysisResult> {
  if (
    input.span.editability
    !== 'native-replacement-candidate'
  ) {
    return unproved(
      'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE',
      [
        'The first clearance producer only supports native-candidate spans with exact simple-Tj provenance.',
      ],
    );
  }

  const intentValidation =
    validateExistingTextEditIntentAgainstSpan(
      input.intent,
      input.span,
    );
  if (
    input.currentRevisionId
      !== input.span.revisionId
    || input.intent.sourceRevisionId
      !== input.currentRevisionId
    || !intentValidation.ok
  ) {
    return unproved(
      'STALE_EDIT_INTENT',
      [
        ...intentValidation.errors,
        ...(input.currentRevisionId
          !== input.span.revisionId
          ? [
              'current revision does not match the inspected span revision',
            ]
          : []),
      ],
    );
  }

  try {
    throwIfAborted(
      input.signal,
      'load PDF for existing-text visual clearance',
    );
    const lib = await pdfLib();
    const document =
      await raceWithAbort(
        lib.PDFDocument.load(
          input.pdfBytes,
          {
            throwOnInvalidObject:
              false,
            updateMetadata: false,
          },
        ),
        input.signal,
        'load PDF for existing-text visual clearance',
      );

    const content =
      readExistingTextPageContentStreamsFromDocument(
        document,
        input.span.pageIndex,
        lib,
        input.signal,
      );
    if (!content.complete) {
      return unproved(
        'INCOMPLETE_CONTENT_STREAM_SET',
        content.diagnostics.map(
          (diagnostic) =>
            diagnostic.message,
        ),
      );
    }
    if (content.streams.length !== 1) {
      return unproved(
        'MULTIPLE_CONTENT_STREAMS',
        [
          `Visual-clearance proof requires exactly one decoded page content stream; found ${content.streams.length}.`,
        ],
      );
    }

    const currentMatch =
      matchExistingTextSpanToContentStream({
        span: input.span,
        content,
      });
    if (
      currentMatch.status
        !== 'matched'
      || !sameProvenance(
        currentMatch.provenance,
        input.provenance,
      )
    ) {
      return unproved(
        'TARGET_PROVENANCE_MISMATCH',
        currentMatch.status
          === 'unmapped'
          ? [
              `Current span provenance is not uniquely mapped: ${currentMatch.reason}.`,
              ...currentMatch.diagnostics,
            ]
          : [
              'Current page provenance no longer matches the supplied target operator.',
            ],
      );
    }

    const page =
      document.getPage(
        input.span.pageIndex,
      );
    let baseFont: string;
    try {
      baseFont =
        resolveExistingTextStandard14BaseFont(
          page,
          input.provenance
            .fontResourceName,
          lib,
        );
    } catch (error) {
      if (
        error
        instanceof ExistingTextReplacementError
      ) {
        return unproved(
          'FONT_RESOURCE_UNSUPPORTED',
          [
            error.message,
            ...(error.details ?? []),
          ],
        );
      }
      throw error;
    }

    const nativeFit =
      await measureExistingTextNativeFit(
        {
          baseFont,
          sourceText:
            input.intent.expectedText,
          replacementText:
            input.intent.replacementText,
          observedAdvancePt:
            input.span.advanceWidthPt,
          fontSizePt:
            input.provenance
              .fontSizePt,
          signal: input.signal,
        },
        lib,
      );

    if (
      nativeFit.sourceText
        !== input.intent.expectedText
      || nativeFit.replacementText
        !== input.intent.replacementText
      || nativeFit.observedAdvancePt
        !== input.span.advanceWidthPt
      || nativeFit.fontSizePt
        !== input.provenance
          .fontSizePt
    ) {
      return unproved(
        'FIT_IDENTITY_MISMATCH',
        [
          'Recomputed fit diagnostic does not match the active span/intent/provenance identity.',
        ],
        nativeFit,
      );
    }

    if (
      nativeFit.status
      !== 'overflows'
    ) {
      return unproved(
        'NATIVE_OVERFLOW_FIT_REQUIRED',
        [
          `Visual fallback evidence is only produced for measurable native overflow; fit status is ${nativeFit.status}.`,
        ],
        nativeFit,
      );
    }

    const geometry =
      buildClearanceGeometry(
        input.span,
        nativeFit
          .projectedReplacementAdvancePt,
        input.provenance
          .fontSizePt,
      );
    if (!geometry) {
      return unproved(
        'CLEARANCE_GEOMETRY_INVALID',
        [
          'Unable to derive finite positive source/replacement clearance geometry.',
        ],
        nativeFit,
      );
    }

    const scan =
      scanExistingTextVisualClearancePaint({
        stream: content.streams[0],
        provenance:
          input.provenance,
        clearanceRectPt:
          geometry.clearanceRectPt,
      });
    if (scan.status !== 'proved') {
      return {
        status: 'unproved',
        reasons: scan.reasons,
        diagnostics:
          scan.diagnostics,
        nativeFit,
      };
    }

    return {
      status: 'proved',
      nativeFit,
      evidence: {
        schemaVersion: 1,
        sourceRevisionId:
          input.span.revisionId,
        pageId:
          input.span.pageId,
        spanId:
          input.span.id,
        sourceCoverage:
          'proved',
        clearanceRectPt:
          geometry.clearanceRectPt,
        background: {
          kind: 'solid',
          colorHex:
            scan.backgroundColorHex,
        },
        foreignPaintIntersections: 0,
        replacementBoundsPt:
          geometry
            .replacementBoundsPt,
      },
      proof: {
        schemaVersion: 1,
        proofMode:
          'single-stream-solid-background-target-text-only',
        streamIndex:
          content.streams[0]
            .streamIndex,
        streamRef:
          content.streams[0]
            .streamRef,
        targetOperatorIndex:
          scan.targetOperatorIndex,
        operatorCount:
          scan.operatorCount,
        backgroundPaintOperatorIndex:
          scan.backgroundPaintOperatorIndex,
        backgroundRectPt:
          scan.backgroundRectPt,
        backgroundColorHex:
          scan.backgroundColorHex,
        sourceBoundsPt:
          geometry.sourceBoundsPt,
        replacementBoundsPt:
          geometry
            .replacementBoundsPt,
        clearanceRectPt:
          geometry.clearanceRectPt,
        foreignPaintIntersections: 0,
      },
    };
  } catch (error) {
    return unproved(
      'PDF_ANALYSIS_FAILED',
      [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    );
  }
}

function buildClearanceGeometry(
  span: ExistingTextSpan,
  projectedReplacementAdvancePt:
    number,
  fontSizePt: number,
): {
  sourceBoundsPt:
    ExistingTextFitRect;
  replacementBoundsPt:
    ExistingTextFitRect;
  clearanceRectPt:
    ExistingTextFitRect;
} | null {
  const ascentPt =
    Math.max(
      span.sourceHeightPt,
      fontSizePt,
    );
  const descentPt =
    fontSizePt * 0.25;
  const y =
    span.originPt.y
    - descentPt;
  const height =
    ascentPt + descentPt;
  const sourceWidth =
    span.advanceWidthPt;
  const replacementWidth =
    projectedReplacementAdvancePt;

  if (
    [
      span.originPt.x,
      y,
      height,
      sourceWidth,
      replacementWidth,
    ].some(
      (value) =>
        !Number.isFinite(value),
    )
    || height <= 0
    || sourceWidth <= 0
    || replacementWidth <= 0
  ) {
    return null;
  }

  const sourceBoundsPt = {
    x: span.originPt.x,
    y,
    width: sourceWidth,
    height,
  };
  const replacementBoundsPt = {
    x: span.originPt.x,
    y,
    width: replacementWidth,
    height,
  };
  const clearanceRectPt = {
    x: span.originPt.x,
    y,
    width:
      Math.max(
        sourceWidth,
        replacementWidth,
      ),
    height,
  };

  return {
    sourceBoundsPt,
    replacementBoundsPt,
    clearanceRectPt,
  };
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
        === expected
          .textMatrix[index],
    )
  );
}

function unproved(
  reason:
    ExistingTextVisualClearanceUnprovedReason,
  diagnostics: string[],
  nativeFit?:
    ExistingTextVisualClearanceAnalysisResult extends
      { status: 'unproved'; nativeFit?: infer T }
      ? T
      : never,
): ExistingTextVisualClearanceAnalysisResult {
  return {
    status: 'unproved',
    reasons: [reason],
    diagnostics,
    ...(nativeFit
      ? { nativeFit }
      : {}),
  };
}
