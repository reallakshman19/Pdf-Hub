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
export {
  DocumentSourceRegistryError,
  registerDocumentSource,
  resolveDocumentSource,
  releaseDocumentSource,
} from './registry';
export {
  DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES,
  materializeDocumentSource,
  type MaterializeDocumentSourceOptions,
} from './materialize';
