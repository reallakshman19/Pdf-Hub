import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import type { DocumentSource } from './types';
import { assertDocumentSourceSize } from './validation';

export const DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES =
  4 * 1024 * 1024;

export interface MaterializeDocumentSourceOptions {
  readonly signal?: AbortSignal;
  readonly chunkBytes?: number;
  readonly maxBytes?: number;
}

export async function materializeDocumentSource(
  source: DocumentSource,
  options: MaterializeDocumentSourceOptions = {},
): Promise<Uint8Array> {
  const size = await raceWithAbort(
    source.size(),
    options.signal,
    'materialize document source: size',
  );
  assertDocumentSourceSize(source.id, size);

  if (
    options.maxBytes !== undefined
    && size > options.maxBytes
  ) {
    throw new RangeError(
      `DocumentSource ${source.id} is ${size} byte(s), exceeding materialization limit ${options.maxBytes}.`,
    );
  }

  const chunkBytes =
    options.chunkBytes ?? DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES;
  if (
    !Number.isSafeInteger(chunkBytes)
    || chunkBytes < 1
  ) {
    throw new RangeError(
      `DocumentSource materialization chunkBytes must be a positive safe integer; received ${chunkBytes}.`,
    );
  }

  const output = new Uint8Array(size);
  for (
    let offset = 0;
    offset < size;
    offset += chunkBytes
  ) {
    throwIfAborted(
      options.signal,
      'materialize document source: before range read',
    );
    const length = Math.min(
      chunkBytes,
      size - offset,
    );
    const chunk = await raceWithAbort(
      source.read(offset, length),
      options.signal,
      'materialize document source: range read',
    );
    if (chunk.byteLength !== length) {
      throw new Error(
        `DocumentSource ${source.id} returned ${chunk.byteLength} byte(s) for a requested ${length}-byte materialization range.`,
      );
    }
    output.set(chunk, offset);
  }

  return output;
}
