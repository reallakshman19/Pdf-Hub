export {
  buildExistingTextPageInspection,
  buildExistingTextSpan,
  createExistingTextEditIntent,
  createExistingTextDeleteIntent,
  createExistingTextSpanId,
  validateExistingTextEditIntentAgainstSpan,
  validateExistingTextDeleteIntentAgainstSpan,
} from './model';

export type {
  ExistingTextDeleteIntent,
  ExistingTextDeleteStrategy,
  ExistingTextDeletionResult,
} from './erasureTypes';

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
  ExistingTextTjOperator,
  ExistingTextSingleStringTjArrayOperator,
  ExistingTextNativeTextOperator,
} from './provenanceTypes';

export {
  ExistingTextReplacementError,
} from './replacementError';

export {
  assertPrintableAsciiReplacement,
  encodeSimpleExistingTextReplacementOperand,
} from './replacementOperand';

export type {
  ExistingTextReplacementErrorCode,
  ExistingTextSimpleReplacementInput,
  ExistingTextSimpleReplacementProof,
  ExistingTextSimpleReplacementResult,
} from './replacementTypes';

export * from './fitPolicy';
export * from './fitTypes';
export * from './visualClearanceScanner';
export * from './visualClearanceTypes';
export * from './columnFlowTypes';
export * from './columnFlowDetector';
export * from './multiColumnReflowEngine';
export * from './ocrNativeReconciliationTypes';
export * from './ocrToNativeBridge';
export * from './crossPageFlowTypes';
export * from './crossPageFlowEngine';
export * from './frameManipulationTypes';
export * from './frameGeometry';

