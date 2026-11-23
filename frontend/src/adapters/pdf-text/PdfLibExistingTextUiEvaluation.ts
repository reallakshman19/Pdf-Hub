import {
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
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
  ExistingTextStyleOverride,
} from '@/core/existing-text/types';
import type { PdfFontMetadata } from '@/core/pdf-fonts';
import {
  readExistingTextPageContentStreams,
} from './PdfLibExistingTextContentStreams';
import {
  analyzeExistingTextVisualClearance,
} from './PdfLibExistingTextVisualClearance';
import {
  resolveBestMatchingStandard14Font,
} from './PdfLibExistingTextFont';

export type ExistingTextUiCapability =
  | {
      status: 'native';
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
      nativeFit:
        ExistingTextNativeFitDiagnostic
        & { status: 'fits' };
      fontMetadata?: PdfFontMetadata | null;
    }
  | {
      status:
        'fallback-proved';
      intent: ExistingTextEditIntent;
      provenance:
        ExistingTextSimpleTextOperator;
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
      evidence:
        ExistingTextReconstructedOverlayEvidence;
      fontMetadata?: PdfFontMetadata | null;
      fallbackReason?:
        | 'VISUAL_OVERFLOW'
        | 'SUBSET_GLYPH_SUBSTITUTION'
        | 'STYLE_OVERRIDE'
        | 'ROTATED_TEXT';
      substituteFontName?: string;
    }
  | {
      status: 'unavailable';
      reasons: string[];
      intent?: ExistingTextEditIntent;
      provenance?:
        ExistingTextSimpleTextOperator;
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
      fontMetadata?: PdfFontMetadata | null;
    };

export async function evaluateExistingTextUiCapability(
  input: {
    pdfBytes: Uint8Array;
    currentRevisionId: string;
    span: ExistingTextSpan;
    replacementText: string;
    styleOverride?: ExistingTextStyleOverride;
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
    intent =
      createExistingTextEditIntent(
        input.span,
        input.replacementText,
        input.styleOverride,
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

  const isRotated = Math.abs(input.span.rotationDegrees ?? 0) > 0.5;

  if (
    clearance.status
      === 'proved'
  ) {
    const isSubsetSubstitution =
      clearance.nativeFit?.status === 'unmeasurable' &&
      clearance.nativeFit.reason === 'MISSING_SUBSET_GLYPHS';
    const isStyleOverridden = Boolean(input.styleOverride);

    const substituteFontName = resolveBestMatchingStandard14Font(
      clearance.fontMetadata,
      match.provenance.fontResourceName,
    );

    return {
      status: 'fallback-proved',
      intent,
      provenance: match.provenance,
      nativeFit: clearance.nativeFit,
      evidence: clearance.evidence,
      fontMetadata: clearance.fontMetadata,
      fallbackReason: isSubsetSubstitution
        ? 'SUBSET_GLYPH_SUBSTITUTION'
        : isStyleOverridden
        ? 'STYLE_OVERRIDE'
        : isRotated
        ? 'ROTATED_TEXT'
        : 'VISUAL_OVERFLOW',
      substituteFontName,
    };
  }

  if (
    !input.styleOverride &&
    !isRotated &&
    clearance.nativeFit
    && clearance.nativeFit.status
      === 'fits'
  ) {
    return {
      status: 'native',
      intent,
      provenance:
        match.provenance,
      nativeFit:
        clearance.nativeFit,
      fontMetadata: clearance.fontMetadata,
    };
  }

  const reasons = [...clearance.reasons, ...clearance.diagnostics];
  if (
    clearance.nativeFit?.status === 'unmeasurable' &&
    clearance.nativeFit.reason === 'MISSING_SUBSET_GLYPHS'
  ) {
    const missing = clearance.nativeFit.missingCharacters ?? [];
    reasons.unshift(
      missing.length > 0
        ? `The font subset does not contain characters: ${missing.join(', ')}.`
        : 'The font subset does not contain the required glyphs.',
    );
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
    fontMetadata: clearance.fontMetadata,
    reasons,
  };
}
