import { DocumentSourceError } from './errors';

export function assertDocumentSourceId(id: string): void {
  if (id.trim().length === 0) {
    throw new DocumentSourceError(
      'INVALID_SOURCE_ID',
      id,
      'DocumentSource id must not be empty.',
    );
  }
}

export function assertDocumentSourceSize(
  sourceId: string,
  size: number,
): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new DocumentSourceError(
      'INVALID_SOURCE_SIZE',
      sourceId,
      `DocumentSource size must be a non-negative safe integer; received ${size}.`,
    );
  }
}

export function assertDocumentSourceReadRange(
  sourceId: string,
  size: number,
  offset: number,
  length: number,
): void {
  assertDocumentSourceSize(sourceId, size);

  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
  ) {
    throw new DocumentSourceError(
      'INVALID_RANGE',
      sourceId,
      `DocumentSource read range must use non-negative safe integers; received offset=${offset}, length=${length}.`,
    );
  }

  if (offset > size || length > size - offset) {
    throw new DocumentSourceError(
      'OUT_OF_BOUNDS',
      sourceId,
      `DocumentSource read range [${offset}, ${offset + length}) exceeds source size ${size}.`,
    );
  }
}
