import type { PdfAnnotation } from '@/core/annotations/types';
import type {
  HistoryState,
  WriterHistoryState,
} from '../types';

export const HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION = 1 as const;
export const HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION = 2 as const;

export interface HistoryStateCheckpointPayloadV1 {
  schemaVersion: typeof HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION;
  annotations: PdfAnnotation[];
  writer: WriterHistoryState;
}

export interface HistoryRecoveryCheckpointPayloadV2 {
  schemaVersion: typeof HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION;
  pageCount: number;
  pageGraph: HistoryState['pageGraph'];
  documentKey: string;
  selectedPageIds: HistoryState['selectedPageIds'];
  selectedPages: HistoryState['selectedPages'];
  currentPageId: HistoryState['currentPageId'];
  currentPage: HistoryState['currentPage'];
  annotations: PdfAnnotation[];
  writer: WriterHistoryState | null;
  ocr: NonNullable<HistoryState['ocr']> | null;
}

export type HistoryStateCheckpointPayload =
  | HistoryStateCheckpointPayloadV1
  | HistoryRecoveryCheckpointPayloadV2;

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
  return cloneHistoryStateCheckpointPayload(
    payload,
  );
}

export function createHistoryRecoveryCheckpointPayload(
  state: HistoryState,
): HistoryRecoveryCheckpointPayloadV2 {
  if (
    !state.documentKey
    || state.documentKey.trim().length === 0
  ) {
    throw new Error(
      'History recovery checkpoint requires a non-empty documentKey.',
    );
  }

  const payload: HistoryRecoveryCheckpointPayloadV2 = {
    schemaVersion:
      HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION,
    pageCount: state.pageCount,
    pageGraph: state.pageGraph,
    documentKey: state.documentKey,
    selectedPageIds: state.selectedPageIds,
    selectedPages: state.selectedPages,
    currentPageId: state.currentPageId,
    currentPage: state.currentPage,
    annotations: state.annotations,
    writer: state.writer ?? null,
    ocr: state.ocr ?? null,
  };

  assertHistoryStateCheckpointPayload(payload);
  return cloneHistoryStateCheckpointPayload(
    payload,
  ) as HistoryRecoveryCheckpointPayloadV2;
}

export function isHistoryRecoveryCheckpointPayload(
  payload: HistoryStateCheckpointPayload,
): payload is HistoryRecoveryCheckpointPayloadV2 {
  return payload.schemaVersion
    === HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION;
}

export function assertHistoryStateCheckpointPayload(
  payload: HistoryStateCheckpointPayload,
): void {
  if (
    payload.schemaVersion
    === HISTORY_STATE_CHECKPOINT_SCHEMA_VERSION
  ) {
    assertV1Payload(payload);
  } else if (
    payload.schemaVersion
    === HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION
  ) {
    assertV2Payload(payload);
  } else {
    throw new Error(
      `Unsupported history state checkpoint schema version: ${(payload as { schemaVersion?: unknown }).schemaVersion}`,
    );
  }

  assertCloneSafeStructuredState(
    payload,
    'stateCheckpoint',
    new WeakSet<object>(),
  );
}

export function cloneHistoryStateCheckpointPayload<
  T extends HistoryStateCheckpointPayload,
>(
  payload: T,
): T {
  assertHistoryStateCheckpointPayload(payload);
  return JSON.parse(
    JSON.stringify(payload),
  ) as T;
}

function assertV1Payload(
  payload: HistoryStateCheckpointPayloadV1,
): void {
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
}

function assertV2Payload(
  payload: HistoryRecoveryCheckpointPayloadV2,
): void {
  if (
    !Number.isInteger(payload.pageCount)
    || payload.pageCount < 1
  ) {
    throw new Error(
      'History recovery checkpoint pageCount must be a positive integer.',
    );
  }
  if (
    !payload.documentKey
    || payload.documentKey.trim().length === 0
  ) {
    throw new Error(
      'History recovery checkpoint documentKey must be non-empty.',
    );
  }
  if (
    payload.pageGraph
    && (
      !Array.isArray(payload.pageGraph.pages)
      || payload.pageGraph.pages.length
        !== payload.pageCount
    )
  ) {
    throw new Error(
      'History recovery checkpoint PageGraph must match pageCount.',
    );
  }
  if (
    !Array.isArray(payload.selectedPageIds)
    || !Array.isArray(payload.selectedPages)
  ) {
    throw new Error(
      'History recovery checkpoint page selection is malformed.',
    );
  }
  if (
    !Number.isInteger(payload.currentPage)
    || payload.currentPage < 1
    || payload.currentPage > payload.pageCount
  ) {
    throw new Error(
      'History recovery checkpoint currentPage is outside page bounds.',
    );
  }
  if (
    payload.currentPageId !== null
    && (
      typeof payload.currentPageId !== 'string'
      || payload.currentPageId.length === 0
    )
  ) {
    throw new Error(
      'History recovery checkpoint currentPageId is malformed.',
    );
  }
  if (!Array.isArray(payload.annotations)) {
    throw new Error(
      'History recovery checkpoint annotations must be an array.',
    );
  }
  if (
    payload.writer !== null
    && (
      !Array.isArray(payload.writer.elements)
      || !Array.isArray(payload.writer.selectedIds)
    )
  ) {
    throw new Error(
      'History recovery checkpoint Writer state is malformed.',
    );
  }
  if (
    payload.ocr !== null
    && (
      !Array.isArray(payload.ocr.corrections)
      || !Array.isArray(payload.ocr.regions)
      || !Array.isArray(
        payload.ocr.selectedPageIndexes,
      )
    )
  ) {
    throw new Error(
      'History recovery checkpoint OCR state is malformed.',
    );
  }
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

const DATA_URI_PATTERN = /data:[^,\s]*,/i;
