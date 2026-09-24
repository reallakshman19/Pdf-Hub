import {
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import {
  assertPrintableAsciiReplacement,
} from '@/core/existing-text/replacementOperand';
import {
  matchExistingTextSpanToContentStream,
} from '@/core/existing-text/provenanceMatcher';
import type {
  ExistingTextReconstructedOverlayEvidence,
  ExistingTextNativeFitDiagnostic,
} from '@/core/existing-text/fitTypes';
import type {
  ExistingTextSimpleTextOperator,
} from '@/core/existing-text/provenanceTypes';
import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from '@/core/existing-text/types';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';
import {
  analyzeExistingTextVisualClearance,
} from './PdfLibExistingTextVisualClearance';

export type ExistingTextUiCapability =
  | {
      status: 'native';
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
      nativeFit:
        ExistingTextNativeFitDiagnostic
        & { status: 'fits' };
    }
  | {
      status:
        'fallback-proved';
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
      nativeFit:
        ExistingTextNativeFitDiagnostic
        & { status: 'overflows' };
      evidence:
        ExistingTextReconstructedOverlayEvidence;
    }
  | {
      status: 'unavailable';
      reasons: string[];
      intent?: ExistingTextEditIntent;
      provenance?:
        ExistingTextSimpleTextOperator;
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
    };

export async function evaluateExistingTextUiCapability(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    span: ExistingTextSpan;
    replacementText: string;
    signal?: AbortSignal;
  },
): Promise<ExistingTextUiCapability> {
  if (
    input.span.editability
      === 'unsupported'
  ) {
    return {
      status: 'unavailable',
      reasons: [
        'This text span is unsupported for existing-PDF editing.',
      ],
    };
  }

  let intent:
    ExistingTextEditIntent;
  try {
    assertPrintableAsciiReplacement(
      input.replacementText,
    );
    intent =
      createExistingTextEditIntent(
        input.span,
        input.replacementText,
      );
  } catch (error) {
    return {
      status: 'unavailable',
      reasons: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    };
  }

  const content =
    await readExistingTextPageContentStreams(
      input.pdfBytes,
      input.span.pageIndex,
      input.signal,
    );
  const match =
    matchExistingTextSpanToContentStream({
      span: input.span,
      content,
    });
  if (match.status !== 'matched') {
    return {
      status: 'unavailable',
      intent,
      reasons: [
        `Exact current text provenance is unavailable: ${match.reason}.`,
        ...match.diagnostics,
      ],
    };
  }

  const clearance =
    await analyzeExistingTextVisualClearance({
      pdfBytes: input.pdfBytes,
      currentRevisionId:
        input.currentRevisionId,
      span: input.span,
      intent,
      provenance:
        match.provenance,
      signal: input.signal,
    });

  if (
    clearance.status
      === 'proved'
  ) {
    return {
      status:
        'fallback-proved',
      intent,
      provenance:
        match.provenance,
      nativeFit:
        clearance.nativeFit,
      evidence:
        clearance.evidence,
    };
  }

  if (
    clearance.nativeFit?.status
      === 'fits'
  ) {
    return {
      status: 'native',
      intent,
      provenance:
        match.provenance,
      nativeFit:
        clearance.nativeFit,
    };
  }

  return {
    status: 'unavailable',
    intent,
    provenance:
      match.provenance,
    ...(clearance.nativeFit
      ? {
          nativeFit:
            clearance.nativeFit,
        }
      : {}),
    reasons: [
      ...clearance.reasons,
      ...clearance.diagnostics,
    ],
  };
}
