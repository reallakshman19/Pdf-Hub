import type { WriterCommand } from '../writer-v2/writerCommands';
import type { WriterElementV2 } from '../writer-v2/types';
import type { WriterV2StoreState } from '../writer-v2/writerV2Store';
import { useWriterV2Store } from '../writer-v2/writerV2Store';
import type {
  OcrWriterInsertionDiagnostic,
  OcrWriterInsertionQueueState,
} from './ocrWriterInsertion';
import {
  buildOcrWriterInsertionResult,
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  validateOcrWriterElementForInsertion,
} from './ocrWriterInsertion';

export interface OcrWriterBridgeInsertOptions {
  documentFingerprint?: string | null;
  selectAll?: boolean;
  now?: string;
}

export interface OcrWriterBridgeInsertResult {
  insertedElements: WriterElementV2[];
  rejectedElements: WriterElementV2[];
  diagnostics: OcrWriterInsertionDiagnostic[];
  command: WriterCommand | null;
  commandApplied: boolean;
  failureReason?: string;
}

export interface InsertOcrWriterElementsIntoStoreInput extends OcrWriterBridgeInsertOptions {
  elements: WriterElementV2[];
  writerStore?: WriterV2StoreState;
}

export interface InsertOcrWriterQueueIntoStoreInput extends OcrWriterBridgeInsertOptions {
  queue: OcrWriterInsertionQueueState;
  writerStore?: WriterV2StoreState;
}

export async function insertOcrWriterElementsIntoWriterV2Store(
  input: InsertOcrWriterElementsIntoStoreInput,
): Promise<OcrWriterBridgeInsertResult> {
  const queue = createOcrWriterInsertionQueue(
    input.elements.map((element) =>
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element,
        now: input.now,
      }),
    ),
  );

  return insertOcrWriterQueueIntoWriterV2Store({
    queue,
    writerStore: input.writerStore,
    documentFingerprint: input.documentFingerprint,
    selectAll: input.selectAll,
    now: input.now,
  });
}

export async function insertOcrWriterQueueIntoWriterV2Store(
  input: InsertOcrWriterQueueIntoStoreInput,
): Promise<OcrWriterBridgeInsertResult> {
  const writerStore = input.writerStore ?? useWriterV2Store.getState();
  const documentFingerprint =
    input.documentFingerprint
    ?? writerStore.currentDocumentFingerprint
    ?? inferDocumentFingerprintFromQueue(input.queue);

  const insertionResult = buildOcrWriterInsertionResult(input.queue);

  const normalizedElements = insertionResult.accepted.map((element) =>
    normalizeOcrWriterElementForInsertion(element, {
      documentFingerprint,
      now: input.now,
    }),
  );

  const rejectedElements = insertionResult.rejected.map(
    (candidate) => candidate.element,
  );

  const validationDiagnostics = normalizedElements.flatMap((element) =>
    validateOcrWriterElementForInsertion(element),
  );

  const blockingDiagnostics = validationDiagnostics.filter(
    (diagnostic) => diagnostic.level === 'error',
  );

  if (blockingDiagnostics.length > 0 || normalizedElements.length === 0) {
    return {
      insertedElements: [],
      rejectedElements: [
        ...rejectedElements,
        ...normalizedElements,
      ],
      diagnostics: [
        ...insertionResult.diagnostics,
        ...validationDiagnostics,
      ],
      command: null,
      commandApplied: false,
    };
  }

  const command = createOcrWriterBatchInsertCommand(normalizedElements, {
    selectAll: input.selectAll ?? true,
  });

  try {
    const dispatchResult =
      await writerStore.dispatchWriterCommandDurable(
        command,
      );

    if (!dispatchResult.changed) {
      return {
        insertedElements: [],
        rejectedElements: [
          ...rejectedElements,
          ...normalizedElements,
        ],
        diagnostics: [
          ...insertionResult.diagnostics,
          ...validationDiagnostics,
        ],
        command,
        commandApplied: false,
        failureReason:
          dispatchResult.reason,
      };
    }

    return {
      insertedElements: normalizedElements,
      rejectedElements,
      diagnostics: [
        ...insertionResult.diagnostics,
        ...validationDiagnostics,
      ],
      command,
      commandApplied: true,
    };
  } catch (error) {
    return {
      insertedElements: [],
      rejectedElements: [
        ...rejectedElements,
        ...normalizedElements,
      ],
      diagnostics: [
        ...insertionResult.diagnostics,
        ...validationDiagnostics,
      ],
      command,
      commandApplied: false,
      failureReason:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

export function createOcrWriterBatchInsertCommand(
  elements: WriterElementV2[],
  options: {
    selectAll?: boolean;
  } = {},
): WriterCommand {
  return {
    type: 'BATCH_ADD_WRITER_ELEMENTS',
    elements,
    selectAll: options.selectAll ?? true,
  };
}

export function normalizeOcrWriterElementForInsertion(
  element: WriterElementV2,
  options: {
    documentFingerprint?: string | null;
    now?: string;
  } = {},
): WriterElementV2 {
  const now = options.now ?? new Date().toISOString();

  return {
    ...element,
    documentFingerprint:
      options.documentFingerprint
      ?? element.documentFingerprint,
    updatedAt: now,
  };
}

export function createOcrWriterBridgeDiagnosticsSummary(
  diagnostics: OcrWriterInsertionDiagnostic[],
): {
  errors: number;
  warnings: number;
  infos: number;
} {
  return diagnostics.reduce(
    (summary, diagnostic) => {
      if (diagnostic.level === 'error') summary.errors += 1;
      if (diagnostic.level === 'warning') summary.warnings += 1;
      if (diagnostic.level === 'info') summary.infos += 1;
      return summary;
    },
    {
      errors: 0,
      warnings: 0,
      infos: 0,
    },
  );
}

function inferDocumentFingerprintFromQueue(
  queue: OcrWriterInsertionQueueState,
): string | null {
  return queue.candidates.find(
    (candidate) => candidate.element.documentFingerprint,
  )?.element.documentFingerprint ?? null;
}
