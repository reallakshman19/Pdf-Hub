import type { PdfAnnotation } from '@/core/annotations/types';
import type { OcrPageAnchoredState } from '@/core/ocr/ocrPageAnchor';
import type { PageGraph, PageId, PageNode } from '@/core/pages/types';
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

export interface HistoryStateCheckpointPayloadV2 {
  schemaVersion: typeof HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION;
  pageCount: number;
  pageGraph: PageGraph<PageNode> | null;
  documentKey: string;
  selectedPageIds: PageId[];
  selectedPages: number[];
  currentPageId: PageId | null;
  currentPage: number;
  annotations: PdfAnnotation[];
  writer: WriterHistoryState;
  ocr: OcrPageAnchoredState;
}

export type HistoryStateCheckpointPayload =
  | HistoryStateCheckpointPayloadV1
  | HistoryStateCheckpointPayloadV2;

const DATA_URI_PATTERN = /data:[^,\s]*,/i;
const FORBIDDEN_RECOVERY_BACKING_KEYS = [
  'bytes',
  'workingBytes',
  'originalBytes',
  'revision',
  'activeRevisionId',
] as const;

export function createHistoryStateCheckpointPayload(
  input: HistoryState,
): HistoryStateCheckpointPayloadV2 {
  if (!input.documentKey || input.documentKey.trim().length === 0) {
    throw new Error(
      'History recovery checkpoint requires a document key.',
    );
  }
  if (!input.writer) {
    throw new Error(
      'History recovery checkpoint requires Writer state.',
    );
  }
  if (!input.ocr) {
    throw new Error(
      'History recovery checkpoint requires OCR page-anchored state.',
    );
  }

  const payload: HistoryStateCheckpointPayloadV2 = {
    schemaVersion:
      HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION,
    pageCount: input.pageCount,
    pageGraph: input.pageGraph,
    documentKey: input.documentKey,
    selectedPageIds: input.selectedPageIds,
    selectedPages: input.selectedPages,
    currentPageId: input.currentPageId,
    currentPage: input.currentPage,
    annotations: input.annotations,
    writer: input.writer,
    ocr: input.ocr,
  };

  assertHistoryStateCheckpointPayload(payload);
  return cloneHistoryStateCheckpointPayload(
    payload,
  ) as HistoryStateCheckpointPayloadV2;
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

export function cloneHistoryStateCheckpointPayload(
  payload: HistoryStateCheckpointPayload,
): HistoryStateCheckpointPayload {
  assertHistoryStateCheckpointPayload(payload);
  return JSON.parse(
    JSON.stringify(payload),
  ) as HistoryStateCheckpointPayload;
}

function assertV1Payload(
  payload: HistoryStateCheckpointPayloadV1,
): void {
  assertAnnotationAndWriterState(payload);
}

function assertV2Payload(
  payload: HistoryStateCheckpointPayloadV2,
): void {
  const record =
    payload as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN_RECOVERY_BACKING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(
        `History recovery checkpoint must not embed PDF/revision backing field ${key}.`,
      );
    }
  }

  if (
    !Number.isInteger(payload.pageCount)
    || payload.pageCount < 1
  ) {
    throw new Error(
      'History recovery checkpoint pageCount must be a positive integer.',
    );
  }
  if (
    payload.pageGraph !== null
    && (
      !payload.pageGraph
      || !Array.isArray(payload.pageGraph.pages)
    )
  ) {
    throw new Error(
      'History recovery checkpoint PageGraph is malformed.',
    );
  }
  if (
    payload.pageGraph
    && payload.pageGraph.pages.length !== payload.pageCount
  ) {
    throw new Error(
      'History recovery checkpoint PageGraph count must match pageCount.',
    );
  }
  if (
    typeof payload.documentKey !== 'string'
    || payload.documentKey.trim().length === 0
  ) {
    throw new Error(
      'History recovery checkpoint documentKey must be non-empty.',
    );
  }
  if (
    !Array.isArray(payload.selectedPageIds)
    || payload.selectedPageIds.some(
      (pageId) =>
        typeof pageId !== 'string'
        || pageId.length === 0,
    )
  ) {
    throw new Error(
      'History recovery checkpoint selectedPageIds must be an array of stable page ids.',
    );
  }
  if (
    !Array.isArray(payload.selectedPages)
    || payload.selectedPages.some(
      (pageNumber) =>
        !Number.isInteger(pageNumber)
        || pageNumber < 1
        || pageNumber > payload.pageCount,
    )
  ) {
    throw new Error(
      'History recovery checkpoint selectedPages must contain valid one-based page numbers.',
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
      'History recovery checkpoint currentPageId must be null or a stable page id.',
    );
  }
  if (
    !Number.isInteger(payload.currentPage)
    || payload.currentPage < 1
    || payload.currentPage > payload.pageCount
  ) {
    throw new Error(
      'History recovery checkpoint currentPage must be a valid one-based page number.',
    );
  }

  assertAnnotationAndWriterState(payload);

  if (
    !payload.ocr
    || !Array.isArray(payload.ocr.corrections)
    || !Array.isArray(payload.ocr.regions)
    || !Array.isArray(payload.ocr.selectedPageIndexes)
  ) {
    throw new Error(
      'History recovery checkpoint OCR state is malformed.',
    );
  }
}

function assertAnnotationAndWriterState(
  payload: Pick<
    HistoryStateCheckpointPayloadV1,
    'annotations' | 'writer'
  >,
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
