export type {
  DocumentSource,
  DocumentSourceCapabilities,
  DocumentSourceKind,
} from './types';
export {
  DocumentSourceError,
  type DocumentSourceErrorCode,
} from './errors';
export {
  assertDocumentSourceId,
  assertDocumentSourceReadRange,
  assertDocumentSourceSize,
} from './validation';
