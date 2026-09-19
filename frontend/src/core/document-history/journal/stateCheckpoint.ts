import type { PdfAnnotation } from '@/core/annotations/types';
import type { WriterHistoryState } from '../types';

export const HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface HistoryStateCheckpointPayloadV1 {
  schemaVersion: typeof HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION;
  annotations: PdfAnnotation[];
  writer: WriterHistoryState;
}

export type HistoryStateCheckpointPayload =
  HistoryStateCheckpointPayloadV1;

const DATA_URI_PATTERN = /data:[^,\s]*,/i;

export function createHistoryStateCheckpointPayload(input: {
  annotations: PdfAnnotation[];
  writer: WriterHistoryState;
}): HistoryStateCheckpointPayloadV1 {
  const payload: HistoryStateCheckpointPayloadV1 = {
    schemaVersion:
      HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION,
    annotations: input.annotations,
    writer: input.writer,
  };

  assertHistoryStateCheckpointPayload(payload);
  return cloneHistoryStateCheckpointPayload(payload);
}

export function assertHistoryStateCheckpointPayload(
  payload: HistoryStateCheckpointPayload,
): void {
  if (
    payload.schemaVersion
    !== HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported history state checkpoint schema version: ${payload.schemaVersion}`,
    );
  }

  if (!Array.isArray(payload.annotations)) {
    throw new Error(
      'History state checkpoint annotations must be an array.',
    );
  }
  if (
    !payload.writer
    || !Array.isArray(payload.writer.elements)
    || !Array.isArray(payload.writer.selectedIds)
  ) {
    throw new Error(
      'History state checkpoint Writer state is malformed.',
    );
  }

  assertCloneSafeStructuredState(
    payload,
    'stateCheckpoint',
    new WeakSet<object>(),
  );
}

export function cloneHistoryStateCheckpointPayload(
  payload: HistoryStateCheckpointPayload,
): HistoryStateCheckpointPayload {
  assertHistoryStateCheckpointPayload(payload);
  return JSON.parse(
    JSON.stringify(payload),
  ) as HistoryStateCheckpointPayload;
}

function assertCloneSafeStructuredState(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (value === null) return;

  switch (typeof value) {
    case 'string':
      if (DATA_URI_PATTERN.test(value)) {
        throw new Error(
          `History state checkpoint contains an inline data URI at ${path}.`,
        );
      }
      return;

    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(
          `History state checkpoint contains a non-finite number at ${path}.`,
        );
      }
      return;

    case 'boolean':
      return;

    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new Error(
        `History state checkpoint contains unsupported ${typeof value} at ${path}.`,
      );

    case 'object':
      break;

    default:
      throw new Error(
        `History state checkpoint contains unsupported value at ${path}.`,
      );
  }

  const objectValue = value as object;

  if (
    objectValue instanceof ArrayBuffer
    || ArrayBuffer.isView(objectValue)
  ) {
    throw new Error(
      `History state checkpoint contains binary typed data at ${path}.`,
    );
  }

  if (
    typeof Blob !== 'undefined'
    && objectValue instanceof Blob
  ) {
    throw new Error(
      `History state checkpoint contains Blob/File binary data at ${path}.`,
    );
  }

  if (seen.has(objectValue)) {
    throw new Error(
      `History state checkpoint contains a cycle at ${path}.`,
    );
  }
  seen.add(objectValue);

  if (Array.isArray(objectValue)) {
    for (
      let index = 0;
      index < objectValue.length;
      index += 1
    ) {
      assertCloneSafeStructuredState(
        objectValue[index],
        `${path}[${index}]`,
        seen,
      );
    }
    seen.delete(objectValue);
    return;
  }

  const prototype =
    Object.getPrototypeOf(objectValue);
  if (
    prototype !== Object.prototype
    && prototype !== null
  ) {
    const name =
      objectValue.constructor?.name
      ?? 'object';
    throw new Error(
      `History state checkpoint contains non-plain object ${name} at ${path}.`,
    );
  }

  if (Object.getOwnPropertySymbols(objectValue).length > 0) {
    throw new Error(
      `History state checkpoint contains symbol-keyed data at ${path}.`,
    );
  }

  for (const [key, child] of Object.entries(
    objectValue as Record<string, unknown>,
  )) {
    assertCloneSafeStructuredState(
      child,
      `${path}.${key}`,
      seen,
    );
  }

  seen.delete(objectValue);
}
