import type {
  ExistingTextEditIntent,
  ExistingTextSpan,
} from './types';
import type {
  ExistingTextNativeFitDiagnostic,
} from './fitTypes';
import type {
  ExistingTextSimpleStringEncoding,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';

export type ExistingTextReplacementErrorCode =
  | 'STALE_EXISTING_TEXT_INTENT'
  | 'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE'
  | 'PROVENANCE_DRIFT'
  | 'UNSUPPORTED_REPLACEMENT_TEXT'
  | 'UNSUPPORTED_FONT_RESOURCE'
  | 'UNSUPPORTED_FONT_ENCODING'
  | 'NATIVE_FIT_UNMEASURABLE'
  | 'NATIVE_REPLACEMENT_OVERFLOW'
  | 'RECONSTRUCTED_VISUAL_CLEARANCE_UNPROVED'
  | 'CONTENT_STREAM_NOT_FOUND'
  | 'SHARED_CONTENT_STREAM_REF'
  | 'SHARED_CONTENT_CONTAINER_REF';

export interface ExistingTextSimpleReplacementMutationInput {
  currentRevisionId: string;
  span: ExistingTextSpan;
  intent: ExistingTextEditIntent;
  provenance:
    ExistingTextSimpleTextOperator;
  signal?: AbortSignal;
}

export interface ExistingTextSimpleReplacementInput
  extends ExistingTextSimpleReplacementMutationInput {
  pdfBytes: Uint8Array;
}

export interface ExistingTextSimpleReplacementProof {
  originalOperandRange: {
    start: number;
    end: number;
  };
  replacementOperandRange: {
    start: number;
    end: number;
  };
  originalDecodedLength: number;
  rewrittenDecodedLength: number;
  prefixBytesPreserved: boolean;
  suffixBytesPreserved: boolean;
  contentTopology:
    | 'single-direct'
    | 'single-indirect'
    | 'array-direct'
    | 'array-indirect';
  targetStreamIndirect: boolean;
  fit:
    ExistingTextNativeFitDiagnostic
    & { status: 'fits' };
}

export interface ExistingTextSimpleReplacementResult {
  pdfBytes: Uint8Array;
  pageIndex: number;
  streamIndex: number;
  streamRef: string | null;
  originalText: string;
  replacementText: string;
  encoding:
    ExistingTextSimpleStringEncoding;
  fontResourceName: string;
  baseFont: string;
  proof:
    ExistingTextSimpleReplacementProof;
}

export type ExistingTextSimpleReplacementMutationResult =
  Omit<
    ExistingTextSimpleReplacementResult,
    'pdfBytes'
  >;
