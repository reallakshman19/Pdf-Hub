export {
  buildExistingTextPageInspection,
  buildExistingTextSpan,
  createExistingTextEditIntent,
  createExistingTextSpanId,
  validateExistingTextEditIntentAgainstSpan,
} from './model';

export type {
  ExistingTextEditIntent,
  ExistingTextEditability,
  ExistingTextEditabilityReason,
  ExistingTextIntentValidation,
  ExistingTextPageContext,
  ExistingTextPageInspection,
  ExistingTextSourceItem,
  ExistingTextSpan,
  ExistingTextTransform,
} from './types';

export {
  scanExistingTextContentStream,
} from './contentStreamScanner';

export {
  matchExistingTextSpanToContentStream,
} from './provenanceMatcher';

export type {
  ExistingTextContentScanResult,
  ExistingTextContentStreamDiagnostic,
  ExistingTextContentStreamDiagnosticCode,
  ExistingTextContentStreamReadResult,
  ExistingTextDecodedContentStream,
  ExistingTextProvenanceMatchInput,
  ExistingTextProvenanceMatchResult,
  ExistingTextProvenanceUnmappedReason,
  ExistingTextSimpleStringEncoding,
  ExistingTextSimpleTextOperator,
} from './provenanceTypes';
