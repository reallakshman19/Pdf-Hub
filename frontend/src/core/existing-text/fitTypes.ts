import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from './types';

export const EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT =
  0.25;

export interface ExistingTextFitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExistingTextNativeFitBase {
  schemaVersion: 1;
  baseFont: string;
  observedAdvancePt: number;
  fontSizePt: number;
  tolerancePt: number;
}

export type ExistingTextNativeFitDiagnostic =
  | (
      ExistingTextNativeFitBase
      & {
        status:
          | 'fits'
          | 'overflows';
        measuredSourceWidthPt: number;
        measuredReplacementWidthPt: number;
        observedToMetricScale: number;
        projectedReplacementAdvancePt: number;
        overflowPt: number;
      }
    )
  | (
      ExistingTextNativeFitBase
      & {
        status:
          'unmeasurable';
        reason:
          | 'INVALID_OBSERVED_ADVANCE'
          | 'INVALID_FONT_SIZE'
          | 'SOURCE_METRIC_ZERO'
          | 'NON_FINITE_METRIC';
      }
    );

export interface ExistingTextReconstructedOverlayEvidence {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageId: string;
  spanId: string;
  sourceCoverage:
    'proved';
  clearanceRectPt:
    ExistingTextFitRect;
  background: {
    kind: 'solid';
    colorHex: string;
  };
  foreignPaintIntersections: number;
  replacementBoundsPt:
    ExistingTextFitRect;
}

export type ExistingTextEditPolicyBlockReason =
  | 'STALE_EDIT_INTENT'
  | 'UNSUPPORTED_SPAN'
  | 'NATIVE_FIT_MISSING'
  | 'NATIVE_FIT_UNMEASURABLE'
  | 'NATIVE_REPLACEMENT_OVERFLOW'
  | 'FALLBACK_EVIDENCE_MISSING'
  | 'FALLBACK_EVIDENCE_STALE'
  | 'FALLBACK_SOURCE_COVERAGE_UNPROVEN'
  | 'FALLBACK_BACKGROUND_NOT_SOLID'
  | 'FALLBACK_CLEARANCE_INVALID'
  | 'FALLBACK_FOREIGN_PAINT_INTERSECTION'
  | 'FALLBACK_REPLACEMENT_OUTSIDE_CLEARANCE';

export type ExistingTextEditPolicyResult =
  | {
      mode:
        'native-replacement';
      span: ExistingTextSpan;
      intent:
        ExistingTextEditIntent;
      nativeFit:
        ExistingTextNativeFitDiagnostic
        & { status: 'fits' };
    }
  | {
      mode:
        'future-reconstructed-overlay-candidate';
      span: ExistingTextSpan;
      intent:
        ExistingTextEditIntent;
      evidence:
        ExistingTextReconstructedOverlayEvidence;
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
    }
  | {
      mode: 'blocked';
      reasons:
        ExistingTextEditPolicyBlockReason[];
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
    };
