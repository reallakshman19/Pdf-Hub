import {
  validatePageGraph,
} from '@/core/pages/pageGraph';
import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import {
  HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION,
  cloneHistoryStateCheckpointPayload,
  type HistoryStateCheckpointPayloadV2,
} from './stateCheckpoint';
import {
  assertHistoryJournalManifest,
  resolveHistoryJournalActiveTransactionId,
  type HistoryJournalCheckpoint,
  type HistoryJournalEntry,
  type HistoryJournalManifest,
  type HistoryJournalRevisionRef,
} from './types';

export type HistoryRecoveryFailureCode =
  | 'INVALID_MANIFEST'
  | 'NO_RECOVERY_CHECKPOINT'
  | 'RECOVERY_CHECKPOINT_INVALID'
  | 'RECOVERY_SUFFIX_BLOCKED';

export interface HistoryRecoveryDiagnostic {
  code: HistoryRecoveryFailureCode;
  message: string;
  checkpointId?: string;
  transactionId?: string;
}

export interface HistoryRecoveryPlan {
  journalId: string;
  fileName: string;
  originalRevisionId: string;
  checkpointId: string;
  checkpointTransactionId: string;
  activeTransactionId: string;
  revision: HistoryJournalRevisionRef;
  state: HistoryStateCheckpointPayloadV2;
  replayEntries: HistoryJournalEntry[];
}

export type HistoryRecoveryPlanResult =
  | {
      ok: true;
      plan: HistoryRecoveryPlan;
      diagnostics: HistoryRecoveryDiagnostic[];
    }
  | {
      ok: false;
      code: HistoryRecoveryFailureCode;
      diagnostics: HistoryRecoveryDiagnostic[];
    };

/**
 * Builds a side-effect-free recovery plan from one durable journal manifest.
 *
 * Recovery always begins from a recovery-complete v2 checkpoint. Any journal
 * entries between that checkpoint and the active cursor must be explicitly
 * self-contained replay operations. Checkpoint-required entries are never
 * guessed or skipped.
 */
export function planHistoryRecovery(
  manifest: HistoryJournalManifest,
): HistoryRecoveryPlanResult {
  try {
    assertHistoryJournalManifest(manifest);
  } catch (error) {
    return failure(
      'INVALID_MANIFEST',
      messageOf(error),
    );
  }

  let activeTransactionId: string | null;
  try {
    activeTransactionId =
      resolveHistoryJournalActiveTransactionId(manifest);
  } catch (error) {
    return failure(
      'INVALID_MANIFEST',
      messageOf(error),
    );
  }

  if (!activeTransactionId) {
    return failure(
      'NO_RECOVERY_CHECKPOINT',
      'History journal is at the admission cursor and has no recovery-complete application-state checkpoint.',
    );
  }

  const activeIndex = manifest.entries.findIndex(
    (entry) => entry.transactionId === activeTransactionId,
  );
  if (activeIndex < 0) {
    return failure(
      'INVALID_MANIFEST',
      `History journal active transaction ${activeTransactionId} is not present in the retained entry chain.`,
      undefined,
      activeTransactionId,
    );
  }

  const diagnostics: HistoryRecoveryDiagnostic[] = [];

  for (
    let checkpointIndex = manifest.checkpoints.length - 1;
    checkpointIndex >= 0;
    checkpointIndex -= 1
  ) {
    const checkpoint = manifest.checkpoints[checkpointIndex];
    if (!checkpoint?.statePayload) continue;
    if (
      checkpoint.statePayload.schemaVersion
      !== HISTORY_RECOVERY_CHECKPOINT_SCHEMA_VERSION
    ) {
      diagnostics.push({
        code: 'RECOVERY_CHECKPOINT_INVALID',
        checkpointId: checkpoint.checkpointId,
        message:
          `Checkpoint ${checkpoint.checkpointId} uses legacy state payload v${checkpoint.statePayload.schemaVersion}; it is not recovery-complete.`,
      });
      continue;
    }
    if (!checkpoint.transactionId) {
      diagnostics.push({
        code: 'RECOVERY_CHECKPOINT_INVALID',
        checkpointId: checkpoint.checkpointId,
        message:
          `Checkpoint ${checkpoint.checkpointId} has recovery state but no transaction cursor anchor.`,
      });
      continue;
    }

    const checkpointEntryIndex = manifest.entries.findIndex(
      (entry) =>
        entry.transactionId === checkpoint.transactionId,
    );
    if (
      checkpointEntryIndex < 0
      || checkpointEntryIndex > activeIndex
    ) {
      continue;
    }

    const validationErrors =
      validateRecoveryCheckpoint(
        manifest,
        checkpoint,
        checkpoint.statePayload,
        checkpointEntryIndex,
      );
    if (validationErrors.length > 0) {
      diagnostics.push(...validationErrors.map((message) => ({
        code: 'RECOVERY_CHECKPOINT_INVALID' as const,
        checkpointId: checkpoint.checkpointId,
        transactionId: checkpoint.transactionId,
        message,
      })));
      continue;
    }

    const replayEntries = manifest.entries.slice(
      checkpointEntryIndex + 1,
      activeIndex + 1,
    );

    const blocked = replayEntries.find(
      (entry) =>
        entry.disposition !== 'SELF_CONTAINED_REPLAY',
    );
    if (blocked) {
      return {
        ok: false,
        code: 'RECOVERY_SUFFIX_BLOCKED',
        diagnostics: [
          ...diagnostics,
          {
            code: 'RECOVERY_SUFFIX_BLOCKED',
            checkpointId: checkpoint.checkpointId,
            transactionId: blocked.transactionId,
            message:
              `Recovery from checkpoint ${checkpoint.checkpointId} would cross ${blocked.disposition} transaction ${blocked.transactionId}; a later recovery-complete checkpoint is required.`,
          },
        ],
      };
    }

    const terminalRevision =
      replayEntries.at(-1)?.afterRevision
      ?? checkpoint.revision;
    if (
      terminalRevision.storeId
        !== manifest.revisionStoreId
      || terminalRevision.revisionId
        !== manifest.activeRevisionId
    ) {
      return {
        ok: false,
        code: 'INVALID_MANIFEST',
        diagnostics: [
          ...diagnostics,
          {
            code: 'INVALID_MANIFEST',
            checkpointId: checkpoint.checkpointId,
            transactionId: activeTransactionId,
            message:
              'Recovery suffix does not terminate at the journal active revision.',
          },
        ],
      };
    }

    return {
      ok: true,
      diagnostics,
      plan: {
        journalId: manifest.journalId,
        fileName: manifest.fileName,
        originalRevisionId: manifest.originalRevisionId,
        checkpointId: checkpoint.checkpointId,
        checkpointTransactionId:
          checkpoint.transactionId,
        activeTransactionId,
        revision: { ...checkpoint.revision },
        state:
          cloneHistoryStateCheckpointPayload(
            checkpoint.statePayload,
          ) as HistoryStateCheckpointPayloadV2,
        replayEntries: replayEntries.map(cloneEntry),
      },
    };
  }

  return {
    ok: false,
    code:
      diagnostics.length > 0
        ? 'RECOVERY_CHECKPOINT_INVALID'
        : 'NO_RECOVERY_CHECKPOINT',
    diagnostics:
      diagnostics.length > 0
        ? diagnostics
        : [{
            code: 'NO_RECOVERY_CHECKPOINT',
            message:
              'History journal has no recovery-complete checkpoint at or before the active cursor.',
          }],
  };
}

function validateRecoveryCheckpoint(
  manifest: HistoryJournalManifest,
  checkpoint: HistoryJournalCheckpoint,
  payload: HistoryStateCheckpointPayloadV2,
  checkpointEntryIndex: number,
): string[] {
  const errors: string[] = [];
  const graph = payload.pageGraph;

  if (
    checkpoint.revision.storeId
      !== manifest.revisionStoreId
  ) {
    errors.push(
      `Checkpoint revision store ${checkpoint.revision.storeId} does not match manifest store ${manifest.revisionStoreId}.`,
    );
  }
  if (
    payload.documentKey
      !== checkpoint.revision.revisionId
  ) {
    errors.push(
      `Checkpoint documentKey ${payload.documentKey} does not match checkpoint revision ${checkpoint.revision.revisionId}.`,
    );
  }

  const entry = manifest.entries[
    checkpointEntryIndex
  ];
  if (
    !entry
    || entry.transactionId
      !== checkpoint.transactionId
  ) {
    errors.push(
      'Checkpoint transaction anchor does not resolve to its retained journal entry.',
    );
  } else if (
    entry.afterRevision.storeId
      !== checkpoint.revision.storeId
    || entry.afterRevision.revisionId
      !== checkpoint.revision.revisionId
  ) {
    errors.push(
      'Checkpoint revision does not match its transaction after-revision.',
    );
  }

  if (!graph) {
    errors.push(
      'Recovery-complete checkpoint requires a PageGraph.',
    );
    return errors;
  }

  const graphValidation = validatePageGraph(graph);
  errors.push(
    ...graphValidation.errors.map(
      (message) => `Invalid recovery PageGraph: ${message}.`,
    ),
  );

  if (graph.pages.length !== payload.pageCount) {
    errors.push(
      `Recovery PageGraph count ${graph.pages.length} does not match pageCount ${payload.pageCount}.`,
    );
  }

  const pageIds = new Set(
    graph.pages.map((page) => page.pageId),
  );

  for (const page of graph.pages) {
    if (page.documentKey !== payload.documentKey) {
      errors.push(
        `Page ${page.pageId} documentKey does not match recovery documentKey.`,
      );
    }
  }

  for (const range of graph.pageLabelRanges ?? []) {
    if (!pageIds.has(range.startPageId)) {
      errors.push(
        `PageLabel range starts at unknown PageId ${range.startPageId}.`,
      );
    }
  }

  validateNavigation(payload, graph, errors);
  validateAnnotations(payload, graph, errors);
  validateWriter(payload, graph, errors);
  validateOcr(payload, graph, errors);

  return errors;
}

function validateNavigation(
  payload: HistoryStateCheckpointPayloadV2,
  graph: PageGraph<PageNode>,
  errors: string[],
): void {
  const current =
    graph.pages[payload.currentPage - 1];
  if (
    !payload.currentPageId
    || !current
    || current.pageId !== payload.currentPageId
  ) {
    errors.push(
      'Recovery currentPage/currentPageId do not identify the same PageGraph node.',
    );
  }

  if (
    payload.selectedPageIds.length
      !== payload.selectedPages.length
  ) {
    errors.push(
      'Recovery selectedPageIds/selectedPages lengths differ.',
    );
    return;
  }

  const seen = new Set<PageId>();
  payload.selectedPageIds.forEach(
    (pageId, index) => {
      if (seen.has(pageId)) {
        errors.push(
          `Recovery selectedPageIds contains duplicate ${pageId}.`,
        );
      }
      seen.add(pageId);
      const pageNumber =
        payload.selectedPages[index];
      const page = pageNumber
        ? graph.pages[pageNumber - 1]
        : undefined;
      if (!page || page.pageId !== pageId) {
        errors.push(
          `Recovery selection ${pageId} does not match physical page ${pageNumber ?? '(missing)'}.`,
        );
      }
    },
  );
}

function validateAnnotations(
  payload: HistoryStateCheckpointPayloadV2,
  graph: PageGraph<PageNode>,
  errors: string[],
): void {
  const ids = new Set<string>();
  for (const annotation of payload.annotations) {
    if (!annotation.id || ids.has(annotation.id)) {
      errors.push(
        `Recovery annotations contain invalid or duplicate id ${annotation.id || '(empty)'}.`,
      );
    }
    ids.add(annotation.id);

    const page =
      graph.pages[annotation.pageNumber - 1];
    if (!page) {
      errors.push(
        `Annotation ${annotation.id} references invalid pageNumber ${annotation.pageNumber}.`,
      );
      continue;
    }
    if (
      annotation.pageId
      && annotation.pageId !== page.pageId
    ) {
      errors.push(
        `Annotation ${annotation.id} pageId does not match pageNumber.`,
      );
    }
  }
}

function validateWriter(
  payload: HistoryStateCheckpointPayloadV2,
  graph: PageGraph<PageNode>,
  errors: string[],
): void {
  const ids = new Set<string>();

  for (const element of payload.writer.elements) {
    if (!element.id || ids.has(element.id)) {
      errors.push(
        `Recovery Writer contains invalid or duplicate element id ${element.id || '(empty)'}.`,
      );
    }
    ids.add(element.id);

    if (
      !element.documentFingerprint
      || !element.documentFingerprint.trim()
    ) {
      errors.push(
        `Writer element ${element.id} has an empty document fingerprint.`,
      );
    }

    const page = graph.pages[element.pageIndex];
    if (!page) {
      errors.push(
        `Writer element ${element.id} references invalid pageIndex ${element.pageIndex}.`,
      );
      continue;
    }

    if (
      payload.writer.documentMode === 'pdfOverlay'
      && !element.pageId
    ) {
      errors.push(
        `PDF-overlay Writer element ${element.id} has no PageId anchor.`,
      );
    }
    if (
      element.pageId
      && element.pageId !== page.pageId
    ) {
      errors.push(
        `Writer element ${element.id} pageId does not match pageIndex.`,
      );
    }
  }

  for (const selectedId of payload.writer.selectedIds) {
    if (!ids.has(selectedId)) {
      errors.push(
        `Writer selected id ${selectedId} does not exist.`,
      );
    }
  }
  if (
    payload.writer.activeId
    && !ids.has(payload.writer.activeId)
  ) {
    errors.push(
      `Writer active id ${payload.writer.activeId} does not exist.`,
    );
  }
}

function validateOcr(
  payload: HistoryStateCheckpointPayloadV2,
  graph: PageGraph<PageNode>,
  errors: string[],
): void {
  const ocr = payload.ocr;

  if (
    ocr.documentFingerprint
    && ocr.documentFingerprint
      !== payload.documentKey
  ) {
    errors.push(
      'OCR documentFingerprint does not match recovery documentKey.',
    );
  }

  for (const pageIndex of ocr.selectedPageIndexes) {
    if (!graph.pages[pageIndex]) {
      errors.push(
        `OCR selectedPageIndexes contains invalid index ${pageIndex}.`,
      );
    }
  }

  for (const correction of ocr.corrections) {
    validatePageAnchor(
      'OCR correction',
      correction.pageId,
      correction.pageIndex,
      graph,
      errors,
    );
  }
  for (const region of ocr.regions) {
    validatePageAnchor(
      'OCR region',
      region.pageId,
      region.pageIndex,
      graph,
      errors,
    );
  }
  if (ocr.reviewFocus) {
    validatePageAnchor(
      'OCR review focus',
      ocr.reviewFocus.pageId,
      ocr.reviewFocus.pageIndex,
      graph,
      errors,
    );
  }

  if (ocr.result) {
    if (
      ocr.result.documentFingerprint
      && ocr.result.documentFingerprint
        !== payload.documentKey
    ) {
      errors.push(
        'OCR result fingerprint does not match recovery documentKey.',
      );
    }
    for (const page of ocr.result.pages) {
      validatePageAnchor(
        'OCR result page',
        page.pageId,
        page.pageIndex
          ?? page.pageNumber - 1,
        graph,
        errors,
      );
    }
  }
}

function validatePageAnchor(
  label: string,
  pageId: PageId | undefined,
  pageIndex: number,
  graph: PageGraph<PageNode>,
  errors: string[],
): void {
  if (
    !Number.isInteger(pageIndex)
    || pageIndex < 0
    || !graph.pages[pageIndex]
  ) {
    errors.push(
      `${label} references invalid pageIndex ${pageIndex}.`,
    );
    return;
  }

  if (
    pageId
    && graph.pages[pageIndex]!.pageId !== pageId
  ) {
    errors.push(
      `${label} PageId does not match pageIndex.`,
    );
  }
}

function cloneEntry(
  entry: HistoryJournalEntry,
): HistoryJournalEntry {
  return JSON.parse(
    JSON.stringify(entry),
  ) as HistoryJournalEntry;
}

function failure(
  code: HistoryRecoveryFailureCode,
  message: string,
  checkpointId?: string,
  transactionId?: string,
): HistoryRecoveryPlanResult {
  return {
    ok: false,
    code,
    diagnostics: [{
      code,
      message,
      ...(checkpointId ? { checkpointId } : {}),
      ...(transactionId ? { transactionId } : {}),
    }],
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}
