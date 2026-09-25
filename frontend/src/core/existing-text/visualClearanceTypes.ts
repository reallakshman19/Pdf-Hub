import type {
  ExistingTextFitRect,
  ExistingTextNativeFitDiagnostic,
  ExistingTextReconstructedOverlayEvidence,
} from './fitTypes';

export type ExistingTextVisualClearanceUnprovedReason =
  | 'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE'
  | 'STALE_EDIT_INTENT'
  | 'NATIVE_OVERFLOW_FIT_REQUIRED'
  | 'FIT_IDENTITY_MISMATCH'
  | 'FONT_RESOURCE_UNSUPPORTED'
  | 'PDF_ANALYSIS_FAILED'
  | 'INCOMPLETE_CONTENT_STREAM_SET'
  | 'MULTIPLE_CONTENT_STREAMS'
  | 'TARGET_PROVENANCE_MISMATCH'
  | 'CONTENT_STREAM_SYNTAX_UNSUPPORTED'
  | 'NON_IDENTITY_TRANSFORM'
  | 'UNSUPPORTED_GRAPHICS_STATE'
  | 'CLIPPING_UNSUPPORTED'
  | 'FOREIGN_PAINT_OPERATOR'
  | 'EXTRA_TEXT_SHOW'
  | 'BACKGROUND_MISSING'
  | 'BACKGROUND_AMBIGUOUS'
  | 'BACKGROUND_COLOR_UNSUPPORTED'
  | 'BACKGROUND_DOES_NOT_COVER_CLEARANCE'
  | 'CLEARANCE_GEOMETRY_INVALID';

export interface ExistingTextVisualClearanceProof {
  schemaVersion: 1;
  proofMode:
    'single-stream-solid-background-target-text-only';
  streamIndex: number;
  streamRef: string | null;
  targetOperatorIndex: number;
  operatorCount: number;
  backgroundPaintOperatorIndex: number;
  backgroundRectPt:
    ExistingTextFitRect;
  backgroundColorHex: string;
  targetTextColorHex: string;
  sourceBoundsPt:
    ExistingTextFitRect;
  replacementBoundsPt:
    ExistingTextFitRect;
  clearanceRectPt:
    ExistingTextFitRect;
  foreignPaintIntersections: 0;
}

export type ExistingTextVisualClearanceAnalysisResult =
  | {
      status: 'proved';
      evidence:
        ExistingTextReconstructedOverlayEvidence;
      nativeFit:
        ExistingTextNativeFitDiagnostic
        & { status: 'overflows' };
      proof:
        ExistingTextVisualClearanceProof;
    }
  | {
      status: 'unproved';
      reasons:
        ExistingTextVisualClearanceUnprovedReason[];
      diagnostics: string[];
      nativeFit?:
        ExistingTextNativeFitDiagnostic;
    };

export type ExistingTextPaintProgramScanResult =
  | {
      status: 'proved';
      operatorCount: number;
      targetOperatorIndex: number;
      backgroundPaintOperatorIndex: number;
      backgroundRectPt:
        ExistingTextFitRect;
      backgroundColorHex: string;
      targetTextColorHex: string;
    }
  | {
      status: 'unproved';
      reasons:
        ExistingTextVisualClearanceUnprovedReason[];
      diagnostics: string[];
    };
