import type {
  ExistingTextSpan,
  ExistingTextTransform,
} from './types';

export interface ExistingTextDecodedContentStream {
  streamIndex: number;
  streamRef: string | null;
  decodedBytes: Uint8Array;
}

export type ExistingTextContentStreamDiagnosticCode =
  | 'NON_RAW_CONTENT_STREAM'
  | 'CONTENT_STREAM_DECODE_FAILED';

export interface ExistingTextContentStreamDiagnostic {
  streamIndex: number;
  streamRef: string | null;
  code:
    ExistingTextContentStreamDiagnosticCode;
  message: string;
}

export interface ExistingTextContentStreamReadResult {
  pageIndex: number;
  complete: boolean;
  streams:
    ExistingTextDecodedContentStream[];
  diagnostics:
    ExistingTextContentStreamDiagnostic[];
}

export type ExistingTextSimpleStringEncoding =
  | 'ascii-literal'
  | 'ascii-hex';

export interface ExistingTextSimpleTextOperatorBase {
  streamIndex: number;
  streamRef: string | null;
  operatorIndex: number;
  operatorRange: {
    start: number;
    end: number;
  };
  operandRange: {
    start: number;
    end: number;
  };
  decodedText: string;
  encoding:
    ExistingTextSimpleStringEncoding;
  fontResourceName: string;
  fontSizePt: number;
  textMatrix:
    ExistingTextTransform;
}

export interface ExistingTextTjOperator
  extends ExistingTextSimpleTextOperatorBase {
  operator: 'Tj';
}

export interface ExistingTextSingleStringTjArrayOperator
  extends ExistingTextSimpleTextOperatorBase {
  operator: 'TJ';
  arrayRange: {
    start: number;
    end: number;
  };
}

export type ExistingTextSimpleTextOperator =
  | ExistingTextTjOperator
  | ExistingTextSingleStringTjArrayOperator;

export type ExistingTextNativeTextOperator =
  ExistingTextSimpleTextOperator;

export interface ExistingTextContentScanResult {
  complete: boolean;
  candidates:
    ExistingTextSimpleTextOperator[];
  diagnostics: string[];
}

export type ExistingTextProvenanceUnmappedReason =
  | 'SPAN_NOT_NATIVE_REPLACEMENT_CANDIDATE'
  | 'INCOMPLETE_CONTENT_STREAM_SET'
  | 'UNSUPPORTED_CONTENT_STREAM_SYNTAX'
  | 'SPAN_OUTSIDE_SIMPLE_TEXT_SUBSET'
  | 'NO_SIMPLE_TEXT_OPERATOR_MATCH'
  | 'AMBIGUOUS_SIMPLE_TEXT_OPERATOR_MATCH';

export type ExistingTextProvenanceMatchResult =
  | {
      status: 'matched';
      spanId: string;
      provenance:
        ExistingTextSimpleTextOperator;
    }
  | {
      status: 'unmapped';
      spanId: string;
      reason:
        ExistingTextProvenanceUnmappedReason;
      candidateCount: number;
      diagnostics: string[];
    };

export interface ExistingTextProvenanceMatchInput {
  span: ExistingTextSpan;
  content:
    ExistingTextContentStreamReadResult;
}
