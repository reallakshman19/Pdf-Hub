export type DocumentSourceErrorCode =
  | 'INVALID_SOURCE_ID'
  | 'INVALID_SOURCE_SIZE'
  | 'INVALID_RANGE'
  | 'OUT_OF_BOUNDS'
  | 'READ_FAILED';

export class DocumentSourceError extends Error {
  readonly code: DocumentSourceErrorCode;
  readonly sourceId: string;

  constructor(
    code: DocumentSourceErrorCode,
    sourceId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DocumentSourceError';
    this.code = code;
    this.sourceId = sourceId;
  }
}
