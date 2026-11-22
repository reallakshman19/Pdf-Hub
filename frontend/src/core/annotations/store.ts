import { create } from 'zustand';
import { materializePdfCommand } from '../commands/types';
import {
  recordStateTransaction,
  writerHistoryState,
  type RecordStateTransactionInput,
} from '../document-history/stateTransaction';
import {
  commitDurableStateMutation,
} from '../document-history/durableStateTransaction';
import { useSessionStore } from '../session/store';
import { useToastStore } from '../toast/store';
import type { PageGraph, PageNode } from '../pages/types';
import { remapAnnotationGeometry } from './geometryTransform';
import { useWriterV2Store } from '../writer-v2/writerV2Store';
import { error as logError } from '../logger/service';
import {
  normalizeAnnotationReview,
  normalizeAnnotationReviews,
  withAnnotationReviewReply,
  withAnnotationReviewStatus,
} from '../review/annotationReview';
import {
  annotationForTargetPage,
  normalizeAnnotationPageAnchors,
} from './pageAnchor';
import {
  guardNativeInteropAnnotationPatch,
  guardNativeInteropStylePatch,
  markNativeAppearanceDirty,
} from './nativeInteropFidelity';

import { v4 as uuidv4 } from 'uuid';
import {
  createNativeDeletionTombstone,
  withNativeEditProvenance,
  type NativeDeletionTombstone,
  type NativeIntegrityState,
} from './nativeIntegrity';
import type { ReviewReply } from '../review/types';
import type {
  AnnotationData,
  AnnotationStyle,
  PdfAnnotation,
  ReviewStatus,
} from './types';

export type AlignMode =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center-horizontal'
  | 'center-vertical';

export type DistributeMode = 'horizontal' | 'vertical';

interface AnnotationState {
  annotations: PdfAnnotation[];
  /** Document key whose complete native annotation model has been loaded. */
  hydratedDocumentKey: string | null;
  /** Explicit native source integrity gate, never inferred from hydration alone. */
  nativeIntegrity: NativeIntegrityState;
  nativeDeletionTombstones: NativeDeletionTombstone[];
  activeAnnotationId: string | null;
  selectedAnnotationIds: string[];
  clipboard: PdfAnnotation[];
  /** Native appearance references are valid only in their source document. */
  clipboardDocumentKey: string | null;
  /** Page identities and geometry at the moment markup was copied. */
  clipboardPageSnapshot: string | null;
}

function markupNeedsStableClipboardPage(annotation: PdfAnnotation): boolean {
  return ['highlight', 'underline', 'strikeout', 'squiggly', 'redaction'].includes(annotation.type)
    && (annotation.data.nativeMarkupDraft !== undefined || Boolean(annotation.data.nativeMarkupRotationSourceHash
      || annotation.data.nativeOriginalName || annotation.data.nativeSourceRef || annotation.data.nativeCopySource));
}

function clipboardPageSnapshot(graph: PageGraph<PageNode> | null): string | null {
  if (!graph || !graph.pages.length) return null;
  const ids = new Set<string>();
  const pages: Array<[string, number, number, number]> = [];
  for (const [index, page] of graph.pages.entries()) {
    if (!page.pageId || ids.has(page.pageId) || page.currentIndex !== index
      || ![0, 90, 180, 270].includes(page.rotation)
      || !Number.isFinite(page.width) || page.width <= 0 || !Number.isFinite(page.height) || page.height <= 0) return null;
    ids.add(page.pageId);
    pages.push([page.pageId, page.rotation, page.width, page.height]);
  }
  return JSON.stringify(pages);
}

interface AnnotationActions {
  addAnnotation: (annotation: PdfAnnotation) => void;
  updateAnnotation: (id: string, data: Partial<PdfAnnotation>) => void;
  updateManyAnnotations: (updates: Array<{ id: string; data: Partial<PdfAnnotation> }>) => void;
  deleteAnnotation: (id: string) => void;
  deleteSelection: () => void;
  setActiveAnnotationId: (id: string | null) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setAnnotations: (annotations: PdfAnnotation[]) => void;
  applyPageRemap: (annotations: PdfAnnotation[]) => void;
  copySelection: () => void;
  pasteClipboard: (targetPage?: number) => void;
  duplicateSelection: () => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (mode: DistributeMode) => void;
  setReviewStatusForSelection: (status: ReviewStatus) => void;
  setReviewStatus: (id: string, status: ReviewStatus) => void;
  addReviewReply: (id: string, content: string, author?: string) => void;
  updateReviewReply: (id: string, replyId: string, content: string) => void;
  deleteReviewReply: (id: string, replyId: string) => void;
  toggleLockSelection: () => void;
  updateStyleForSelection: (stylePatch: Partial<AnnotationStyle> & Partial<AnnotationData>) => void;
}

function createAnnotationTransactionInput(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  label = 'Edit annotations',
): RecordStateTransactionInput | null {
  const session = useSessionStore.getState();
  const hasDurableRevision = Boolean(
    session.revisionStoreId
    && session.activeRevisionId,
  );
  if (
    !session.documentKey
    || (!hasDurableRevision && !session.workingBytes)
  ) {
    return null;
  }

  const writer = useWriterV2Store.getState();
  const nextById = new Map(
    nextAnnotations.map((annotation) => [
      annotation.id,
      annotation,
    ]),
  );
  const currentById = new Map(
    state.annotations.map((annotation) => [
      annotation.id,
      annotation,
    ]),
  );
  const annotationIds = Array.from(
    new Set([
      ...state.annotations
        .filter((annotation) =>
          !nextById.has(annotation.id)
          || nextById.get(annotation.id)
            !== annotation
        )
        .map((annotation) => annotation.id),
      ...nextAnnotations
        .filter((annotation) =>
          !currentById.has(annotation.id)
          || currentById.get(annotation.id)
            !== annotation
        )
        .map((annotation) => annotation.id),
    ]),
  );

  return {
    command: materializePdfCommand(
      {
        type: 'ANNOTATION_CHANGE',
        payload: {
          action: label,
          annotationIds,
        },
      },
      'annotation-store',
      session.documentKey,
    ),
    label,
    before: {
      annotations: state.annotations,
      writer: writerHistoryState(writer),
    },
    after: {
      annotations: nextAnnotations,
      writer: writerHistoryState(writer),
    },
  };
}

function recordAnnotationMutation(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  label = 'Edit annotations',
): void {
  const input = createAnnotationTransactionInput(
    state,
    nextAnnotations,
    label,
  );
  if (input) recordStateTransaction(input);
}

function normalizeIds(ids: string[], annotations: PdfAnnotation[]): string[] {
  const allowed = new Set(annotations.map((annotation) => annotation.id));
  return Array.from(new Set(ids)).filter((id) => allowed.has(id));
}

function markAnnotationDirty(): void {
  useSessionStore.getState().setDirty(true);
}

function selectedAnnotations(
  annotations: PdfAnnotation[],
  ids: string[],
): PdfAnnotation[] {
  const idSet = new Set(ids);
  return annotations.filter((annotation) => idSet.has(annotation.id));
}

function dropRestoredNativeDeletionCommands(
  tombstones: NativeDeletionTombstone[],
  annotations: readonly PdfAnnotation[],
): NativeDeletionTombstone[] {
  const restored = new Set(annotations
    .filter((item) => item.data.nativeSourceRef && !item.data.nativeCopySource)
    .map((item) => JSON.stringify([item.pageNumber, item.data.nativeSourceRef])));
  return tombstones.some((item) => restored.has(JSON.stringify([item.pageNumber, item.sourceRef])))
    ? tombstones.filter((item) => !restored.has(JSON.stringify([item.pageNumber, item.sourceRef])))
    : tombstones;
}

function annotationSnapshot(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  nextSelectedIds?: string[],
  nextActiveId?: string | null,
) {
  const anchoredAnnotations =
    normalizeAnnotationPageAnchors(
      nextAnnotations,
      useSessionStore.getState().pageGraph,
    );

  return {
    annotations: anchoredAnnotations,
    // Undo / restored source roots revoke the deletion command. A later cache
    // omission must not revive an already undone deletion.
    nativeDeletionTombstones: dropRestoredNativeDeletionCommands(
      state.nativeDeletionTombstones, anchoredAnnotations,
    ),
    selectedAnnotationIds: normalizeIds(
      nextSelectedIds ?? state.selectedAnnotationIds,
      anchoredAnnotations,
    ),
    activeAnnotationId:
      nextActiveId !== undefined
        ? nextActiveId
        : normalizeIds(state.selectedAnnotationIds, anchoredAnnotations)[0] ?? null,
  };
}

// Preserve already imported records verbatim; reject a mutation only if it
// introduces/increases an ambiguous identity. Do not silently deduplicate.
function introducesDuplicateAnnotationId(
  before: readonly PdfAnnotation[],
  after: readonly PdfAnnotation[],
): boolean {
  const counts = (items: readonly PdfAnnotation[]) => {
    const result = new Map<string, number>();
    for (const item of items) result.set(item.id, (result.get(item.id) ?? 0) + 1);
    return result;
  };
  const previous = counts(before);
  for (const [id, count] of counts(after)) {
    if (count > Math.max(1, previous.get(id) ?? 0)) return true;
  }
  return false;
}

type AnnotationStore =
  AnnotationState & AnnotationActions;

type AnnotationMutationDeriver = (
  state: AnnotationStore,
) =>
  | Partial<AnnotationState>
  | AnnotationStore
  | null;

function usesDurableAnnotationHistory(): boolean {
  const session = useSessionStore.getState();
  return Boolean(
    session.documentKey
    && session.revisionStoreId
    && session.activeRevisionId
    && session.historyJournalStoreId
    && session.historyJournalId,
  );
}

function annotationStateSnapshot(
  state: AnnotationState,
): AnnotationState {
  return {
    annotations: [...state.annotations],
    hydratedDocumentKey: state.hydratedDocumentKey,
    nativeIntegrity: state.nativeIntegrity,
    nativeDeletionTombstones: [...state.nativeDeletionTombstones],
    activeAnnotationId: state.activeAnnotationId,
    selectedAnnotationIds: [
      ...state.selectedAnnotationIds,
    ],
    clipboard: [...state.clipboard],
    clipboardDocumentKey: state.clipboardDocumentKey,
    clipboardPageSnapshot: state.clipboardPageSnapshot,
  };
}

function cloneAnnotationData(
  annotation: PdfAnnotation,
  now: number,
  offset: { x: number; y: number },
): AnnotationData {
  const cleanData: AnnotationData = { ...annotation.data };
  // A copied or duplicated annotation is a fresh user-owned annotation.
  // It must not carry read-only interop locks from source document parsing.
  delete cleanData.nativeInterop;
  cleanData.nativeCopySource = annotation.data.nativeCopySource ?? {
    pageNumber: annotation.pageNumber,
    nativeName: annotation.data.nativeOriginalName ?? annotation.id,
    ...(annotation.data.nativeIdentityAmbiguous ? { ambiguous: true } : {}),
    ...((annotation.data.nativeInterop?.richText || annotation.data.hasCustomAppearance) ? { requiresSource: true } : {}),
  };
  delete cleanData.nativeOriginalName;
  delete cleanData.nativeIdentityAmbiguous;
  delete cleanData.nativeDeletedReplyIds;

  // Deep clone review thread with fresh unique IDs and remapped parent references
  if (cleanData.review?.replies && cleanData.review.replies.length > 0) {
    const idMap = new Map<string, string>();
    cleanData.review.replies.forEach((reply) => {
      idMap.set(reply.id, uuidv4());
    });

    const clonedReplies: ReviewReply[] = cleanData.review.replies.map((reply) => {
      const clonedReply: ReviewReply = {
        ...reply,
        id: idMap.get(reply.id) ?? uuidv4(),
        nativeCopySourceId: reply.nativeCopySourceId ?? reply.id,
      };
      if (reply.parentReplyId && idMap.has(reply.parentReplyId)) {
        clonedReply.parentReplyId = idMap.get(reply.parentReplyId);
      }
      delete clonedReply.nativeInterop;
      return clonedReply;
    });

    cleanData.review = {
      ...cleanData.review,
      replies: clonedReplies,
      updatedAt: now,
    };
  }

  // Offset anchor and knee if present
  if (cleanData.anchor && typeof cleanData.anchor === 'object' && cleanData.anchor !== null) {
    cleanData.anchor = {
      x: (cleanData.anchor as { x: number }).x + offset.x,
      y: (cleanData.anchor as { y: number }).y + offset.y,
    };
  }
  if (cleanData.knee && typeof cleanData.knee === 'object' && cleanData.knee !== null) {
    cleanData.knee = {
      x: (cleanData.knee as { x: number }).x + offset.x,
      y: (cleanData.knee as { y: number }).y + offset.y,
    };
  }

  return remapAnnotationGeometry(annotation, {
    ...annotation.rect,
    x: annotation.rect.x + offset.x,
    y: annotation.rect.y + offset.y,
  }, cleanData);
}

/**
 * Only explicit user deletion actions can produce native tombstones. A bad
 * page anchor or unverified import blocks the action instead of discarding
 * the underlying PDF object. Undo/redo retain the original command ID, while
 * the writer considers it only when the native object is absent.
 */
function explicitNativeDeletionCommands(
  state: AnnotationState,
  removed: readonly PdfAnnotation[],
): NativeDeletionTombstone[] | null {
  const session = useSessionStore.getState();
  const native = removed.filter((item) => item.data.nativeSourceRef && !item.data.nativeCopySource);
  if (!native.length) return state.nativeDeletionTombstones;
  if (state.nativeIntegrity.status !== 'COMPLETE'
    || state.nativeIntegrity.documentKey !== session.documentKey) {
    logError('annotation', 'Native deletion blocked: source integrity is not verified');
    useToastStore.getState().addToast({
      type: 'error', title: 'Native deletion unavailable',
      message: 'Complete annotation import verification before deleting native PDF objects.',
    });
    return null;
  }
  const commandId = uuidv4();
  const additions = native.map((annotation) => createNativeDeletionTombstone(
    annotation,
    session.documentKey,
    annotation.pageId ?? session.pageGraph?.pages[annotation.pageNumber - 1]?.pageId,
    commandId,
  ));
  if (additions.some((item) => item === null)) {
    logError('annotation', 'Native deletion blocked: source page identity unavailable');
    return null;
  }
  const indexed = new Map(state.nativeDeletionTombstones.map((item) => [
    JSON.stringify([item.pageNumber, item.sourceRef]), item,
  ]));
  for (const item of additions) if (item) {
    indexed.set(JSON.stringify([item.pageNumber, item.sourceRef]), item);
  }
  return [...indexed.values()];
}

export const useAnnotationStore =
  create<AnnotationStore>((set, get) => {
    const runMutation = (
      derive: AnnotationMutationDeriver,
      label = 'Edit annotations',
    ): void => {
      if (!usesDurableAnnotationHistory()) {
        set((state) => {
          const next = derive(state);
          if (!next || next === state) return state;

          const nextAnnotations =
            next.annotations ?? state.annotations;
          if (introducesDuplicateAnnotationId(state.annotations, nextAnnotations)) {
            logError('annotation', 'Duplicate annotation identity rejected', { label });
            return state;
          }
          markAnnotationDirty();
          recordAnnotationMutation(
            state,
            nextAnnotations,
            label,
          );
          return next;
        });
        return;
      }

      void commitDurableStateMutation(() => {
        const state = get();
        const next = derive(state);
        if (!next || next === state) return null;

        const nextAnnotations =
          next.annotations ?? state.annotations;
        if (introducesDuplicateAnnotationId(state.annotations, nextAnnotations)) {
          logError('annotation', 'Duplicate annotation identity rejected', { label });
          return null;
        }
        const transaction =
          createAnnotationTransactionInput(
            state,
            nextAnnotations,
            label,
          );
        if (!transaction) return null;

        const beforeState =
          annotationStateSnapshot(state);

        return {
          ...transaction,
          apply: () => {
            set(next);
            markAnnotationDirty();
          },
          rollback: () => {
            set(beforeState);
          },
        };
      }).catch((error) => {
        logError(
          'annotation',
          'Durable annotation mutation failed',
          { error: String(error), label },
        );
      });
    };

    return {
  annotations: [],
  hydratedDocumentKey: null,
  nativeIntegrity: { status: 'LOADING', documentKey: null },
  nativeDeletionTombstones: [],
  activeAnnotationId: null,
  selectedAnnotationIds: [],
  clipboard: [],
  clipboardDocumentKey: null,
  clipboardPageSnapshot: null,

  addAnnotation: (annotation) =>
    runMutation((state) => {
      const graph = useSessionStore.getState().pageGraph;
      if (graph && (
        !Number.isInteger(annotation.pageNumber)
        || annotation.pageNumber < 1
        || annotation.pageNumber > graph.pages.length
        || (annotation.pageId !== undefined
          && graph.pages[annotation.pageNumber - 1]?.pageId !== annotation.pageId)
      )) {
        logError('annotation', 'Invalid or stale annotation page anchor rejected', {
          annotationId: annotation.id,
        });
        return state;
      }
      const normalizedAnnotation = annotationForTargetPage(
        normalizeAnnotationReview(annotation),
        useSessionStore.getState().pageGraph,
        annotation.pageNumber,
      );
      return annotationSnapshot(
        state,
        [...state.annotations, normalizedAnnotation],
        [normalizedAnnotation.id],
        normalizedAnnotation.id,
      );
    }),

  updateAnnotation: (id, data) =>
    runMutation((state) => {
      const nextAnnotations = state.annotations.map((annotation) => {
        if (annotation.id !== id) return annotation;

        const guardedPatch = guardNativeInteropAnnotationPatch(
          annotation,
          data,
        );
        if (Object.keys(guardedPatch).length === 0) {
          return annotation;
        }

        const updated: PdfAnnotation = withNativeEditProvenance(
          annotation,
          markNativeAppearanceDirty(annotation, {
            ...annotation,
            ...guardedPatch,
            data: guardedPatch.rect
              ? remapAnnotationGeometry(annotation, guardedPatch.rect, guardedPatch.data ?? annotation.data)
              : guardedPatch.data ?? annotation.data,
            updatedAt: Date.now(),
          }),
          useSessionStore.getState().documentKey,
          uuidv4(),
        );

        return (
          typeof guardedPatch.pageNumber === 'number'
          && guardedPatch.pageId === undefined
        )
          ? annotationForTargetPage(
              updated,
              useSessionStore.getState().pageGraph,
              guardedPatch.pageNumber,
            )
          : updated;
      });

      if (
        nextAnnotations.every(
          (annotation, index) => annotation === state.annotations[index],
        )
      ) {
        return state;
      }

      return annotationSnapshot(state, nextAnnotations);
    }),

  updateManyAnnotations: (updates) =>
    runMutation((state) => {
      const patchMap = new Map(updates.map((entry) => [entry.id, entry.data]));
      const nextAnnotations = state.annotations.map((annotation) => {
        const patch = patchMap.get(annotation.id);
        if (!patch) return annotation;

        const guardedPatch = guardNativeInteropAnnotationPatch(
          annotation,
          patch,
        );
        if (Object.keys(guardedPatch).length === 0) {
          return annotation;
        }

        const updated: PdfAnnotation = withNativeEditProvenance(
          annotation,
          markNativeAppearanceDirty(annotation, {
            ...annotation,
            ...guardedPatch,
            data: guardedPatch.rect
              ? remapAnnotationGeometry(annotation, guardedPatch.rect, guardedPatch.data ?? annotation.data)
              : guardedPatch.data ?? annotation.data,
            updatedAt: Date.now(),
          }),
          useSessionStore.getState().documentKey,
          uuidv4(),
        );

        return (
          typeof guardedPatch.pageNumber === 'number'
          && guardedPatch.pageId === undefined
        )
          ? annotationForTargetPage(
              updated,
              useSessionStore.getState().pageGraph,
              guardedPatch.pageNumber,
            )
          : updated;
      });

      if (
        nextAnnotations.every(
          (annotation, index) => annotation === state.annotations[index],
        )
      ) {
        return state;
      }

      return annotationSnapshot(state, nextAnnotations);
    }),

  deleteAnnotation: (id) =>
    runMutation((state) => {
      const removed = state.annotations.filter((annotation) => annotation.id === id);
      if (!removed.length) return state;
      const tombstones = explicitNativeDeletionCommands(state, removed);
      if (!tombstones) return state;
      const nextAnnotations = state.annotations.filter((annotation) => annotation.id !== id);
      const nextSelectedIds = state.selectedAnnotationIds.filter((value) => value !== id);
      const nextActiveId =
        state.activeAnnotationId === id ? nextSelectedIds[0] ?? null : state.activeAnnotationId;

      return {
        ...annotationSnapshot(state, nextAnnotations, nextSelectedIds, nextActiveId),
        nativeDeletionTombstones: tombstones,
      };
    }, 'Delete annotations'),

  deleteSelection: () => {
    const targetIds = [...get().selectedAnnotationIds];
    runMutation((state) => {
      if (!targetIds.length) return state;
      const selectedSet = new Set(targetIds);
      const removed = state.annotations.filter((annotation) => selectedSet.has(annotation.id));
      const tombstones = explicitNativeDeletionCommands(state, removed);
      if (!tombstones) return state;
      const nextAnnotations = state.annotations.filter(
        (annotation) => !selectedSet.has(annotation.id),
      );
      return {
        ...annotationSnapshot(state, nextAnnotations, [], null),
        nativeDeletionTombstones: tombstones,
      };
    }, 'Delete annotations');
  },
  setActiveAnnotationId: (id) =>
    set((state) => ({
      activeAnnotationId: id,
      selectedAnnotationIds: id ? [id] : state.selectedAnnotationIds,
    })),

  setSelection: (ids) =>
    set((state) => {
      const normalized = normalizeIds(ids, state.annotations);
      return {
        selectedAnnotationIds: normalized,
        activeAnnotationId: normalized[0] ?? null,
      };
    }),

  toggleSelection: (id) =>
    set((state) => {
      const exists = state.selectedAnnotationIds.includes(id);
      const next = exists
        ? state.selectedAnnotationIds.filter((value) => value !== id)
        : [...state.selectedAnnotationIds, id];

      return {
        selectedAnnotationIds: next,
        activeAnnotationId: next[0] ?? state.activeAnnotationId,
      };
    }),

  clearSelection: () =>
    set({
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    }),

  setAnnotations: (annotations) =>
    set((state) => {
      const normalized = normalizeAnnotationPageAnchors(
        normalizeAnnotationReviews(annotations),
        useSessionStore.getState().pageGraph,
      );
      return {
        annotations: normalized,
        nativeDeletionTombstones: dropRestoredNativeDeletionCommands(
          state.nativeDeletionTombstones, normalized,
        ),
        selectedAnnotationIds: [],
        activeAnnotationId: null,
      };
    }),

  applyPageRemap: (annotations) =>
    runMutation((state) =>
      annotationSnapshot(
        state,
        annotations,
        [],
        null,
      )
    ),

  copySelection: () =>
    set((state) => {
      const ids =
        state.selectedAnnotationIds.length > 0
          ? state.selectedAnnotationIds
          : state.activeAnnotationId
          ? [state.activeAnnotationId]
          : [];

      const copied = selectedAnnotations(state.annotations, ids).map(
        (annotation) => ({
          ...annotation,
          data: { ...annotation.data },
        }),
      );

      const session = useSessionStore.getState();
      return { clipboard: copied, clipboardDocumentKey: session.documentKey,
        clipboardPageSnapshot: clipboardPageSnapshot(session.pageGraph) };
    }),

  pasteClipboard: (targetPage) => {
    const current = get();
    const session = useSessionStore.getState();
    const documentChanged = current.clipboardDocumentKey !== session.documentKey;
    if (current.clipboard.some(markupNeedsStableClipboardPage)) {
      const currentSnapshot = clipboardPageSnapshot(session.pageGraph);
      const pagesValid = current.clipboard.every((annotation) => {
        const destination = targetPage ?? annotation.pageNumber;
        return Number.isInteger(destination) && destination >= 1 && destination <= (session.pageGraph?.pages.length ?? 0)
          && Number.isInteger(annotation.pageNumber) && annotation.pageNumber >= 1
          && annotation.pageNumber <= (session.pageGraph?.pages.length ?? 0);
      });
      if (documentChanged || !session.documentKey || !current.clipboardPageSnapshot
        || current.clipboardPageSnapshot !== currentSnapshot || !pagesValid) {
        useToastStore.getState().addToast({ type: 'error', title: 'Copy markup again',
          message: 'The document or page layout changed, or page information is unavailable. Copy the markup again before pasting.', duration: 6000 });
        return;
      }
    } else if (documentChanged) return;
    const sourceClipboard = get().clipboard.map(
      (annotation) => ({
        ...annotation,
        rect: { ...annotation.rect },
        data: { ...annotation.data },
      }),
    );

    runMutation((state) => {
      if (sourceClipboard.length === 0) return state;

      const now = Date.now();
      const targetGraph = useSessionStore.getState().pageGraph;
      const pasted = sourceClipboard.map(
        (annotation, index) => {
          const offsetX = 18;
          const offsetY = 18 + index * 4;
          const data = cloneAnnotationData(annotation, now, { x: offsetX, y: offsetY });
          const destination = targetPage ?? annotation.pageNumber;
          const sourceRotation = targetGraph?.pages[annotation.pageNumber - 1]?.rotation;
          const targetRotation = targetGraph?.pages[destination - 1]?.rotation;
          if (annotation.data.nativeMarkupRotationSourceHash && sourceRotation !== undefined && targetRotation !== undefined) {
            const offset = (annotation.data.nativeMarkupPreviewOffset ?? 0) + (sourceRotation - targetRotation) / 90;
            if (Number.isInteger(offset)) data.nativeMarkupPreviewOffset = ((offset % 4) + 4) % 4;
          }
          const draft = annotation.data.nativeMarkupDraft;
          if (draft && destination !== annotation.pageNumber) {
            const validRotations = sourceRotation !== undefined && targetRotation !== undefined
              && [0, 90, 180, 270].includes(sourceRotation) && [0, 90, 180, 270].includes(targetRotation);
            data.nativeMarkupDraft = { ...draft, basisRotation: validRotations
              ? ((draft.basisRotation + targetRotation! - sourceRotation!) % 360 + 360) % 360 : -1 };
          }
          const basis = annotation.data.nativeStampBasisRotation;
          if (annotation.type === 'stamp' && annotation.data.nativeStampAppearanceKind !== 'imported'
            && typeof basis === 'number' && sourceRotation !== undefined && targetRotation !== undefined) {
            data.nativeStampCopySourceBasisRotation = annotation.data.nativeStampCopySourceBasisRotation ?? basis;
            data.nativeStampBasisRotation = ((basis + targetRotation - sourceRotation) % 360 + 360) % 360;
          }
          return annotationForTargetPage(
            {
              ...annotation,
              id: uuidv4(),
              pageNumber: destination,
              rect: {
                ...annotation.rect,
                x: annotation.rect.x + offsetX,
                y: annotation.rect.y + offsetY,
              },
              data,
              createdAt: now,
              updatedAt: now,
            },
            targetGraph,
            destination,
          );
        },
      );

      return annotationSnapshot(
        state,
        [...state.annotations, ...pasted],
        pasted.map((annotation) => annotation.id),
        pasted[0]?.id ?? null,
      );
    });
  },

  duplicateSelection: () => {
    const invocationState = get();
    const ids =
      invocationState.selectedAnnotationIds.length > 0
        ? [...invocationState.selectedAnnotationIds]
        : invocationState.activeAnnotationId
        ? [invocationState.activeAnnotationId]
        : [];

    runMutation((state) => {
      if (ids.length === 0) return state;

      const now = Date.now();
      const duplicated = selectedAnnotations(state.annotations, ids).map(
        (annotation, index) => {
          const offsetX = 20;
          const offsetY = 20 + index * 4;
          return {
            ...annotation,
            id: uuidv4(),
            rect: {
              ...annotation.rect,
              x: annotation.rect.x + offsetX,
              y: annotation.rect.y + offsetY,
            },
            data: cloneAnnotationData(annotation, now, { x: offsetX, y: offsetY }),
            createdAt: now,
            updatedAt: now,
          };
        },
      );

      if (duplicated.length === 0) return state;

      return annotationSnapshot(
        state,
        [...state.annotations, ...duplicated],
        duplicated.map((annotation) => annotation.id),
        duplicated[0]?.id ?? null,
      );
    });
  },
  alignSelection: (mode) => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];
    runMutation((state) => {
      if (targetIds.length < 2) return state;

      const selected = selectedAnnotations(
        state.annotations,
        targetIds,
      );
      const left = Math.min(...selected.map((annotation) => annotation.rect.x));
      const top = Math.min(...selected.map((annotation) => annotation.rect.y));
      const right = Math.max(
        ...selected.map((annotation) => annotation.rect.x + annotation.rect.width),
      );
      const bottom = Math.max(
        ...selected.map((annotation) => annotation.rect.y + annotation.rect.height),
      );
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;

      const selectedSet = new Set(targetIds);

      const nextAnnotations = state.annotations.map((annotation) => {
        if (!selectedSet.has(annotation.id)) return annotation;
        if (annotation.data.locked === true) return annotation;

        const rect = { ...annotation.rect };
        if (mode === 'left') rect.x = left;
        if (mode === 'right') rect.x = right - rect.width;
        if (mode === 'top') rect.y = top;
        if (mode === 'bottom') rect.y = bottom - rect.height;
        if (mode === 'center-horizontal') rect.x = centerX - rect.width / 2;
        if (mode === 'center-vertical') rect.y = centerY - rect.height / 2;

        return withNativeEditProvenance(
          annotation,
          markNativeAppearanceDirty(annotation, {
            ...annotation,
            rect,
            data: remapAnnotationGeometry(annotation, rect),
            updatedAt: Date.now(),
          }),
          useSessionStore.getState().documentKey,
          uuidv4(),
        );
      });

      return annotationSnapshot(state, nextAnnotations);
    });
  },
  distributeSelection: (mode) => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];
    runMutation((state) => {
      if (targetIds.length < 3) return state;

      const selected = selectedAnnotations(
        state.annotations,
        targetIds,
      ).filter(
        (annotation) => annotation.data.locked !== true,
      );
      if (selected.length < 3) return state;

      const sorted =
        mode === 'horizontal'
          ? [...selected].sort((a, b) => a.rect.x - b.rect.x)
          : [...selected].sort((a, b) => a.rect.y - b.rect.y);

      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const middle = sorted.slice(1, -1);

      const totalMiddleSize = middle.reduce(
        (sum, annotation) =>
          sum + (mode === 'horizontal' ? annotation.rect.width : annotation.rect.height),
        0,
      );

      const start =
        mode === 'horizontal'
          ? first.rect.x + first.rect.width
          : first.rect.y + first.rect.height;

      const end = mode === 'horizontal' ? last.rect.x : last.rect.y;
      const gap = middle.length > 0 ? (end - start - totalMiddleSize) / (middle.length + 1) : 0;

      let cursor = start + gap;
      const nextById = new Map<string, PdfAnnotation>();

      for (const annotation of middle) {
        const rect = { ...annotation.rect };
        if (mode === 'horizontal') {
          rect.x = cursor;
          cursor += rect.width + gap;
        } else {
          rect.y = cursor;
          cursor += rect.height + gap;
        }

        nextById.set(annotation.id, withNativeEditProvenance(
          annotation,
          markNativeAppearanceDirty(annotation, {
            ...annotation,
            rect,
            data: remapAnnotationGeometry(annotation, rect),
            updatedAt: Date.now(),
          }),
          useSessionStore.getState().documentKey,
          uuidv4(),
        ));
      }

      const nextAnnotations = state.annotations.map(
        (annotation) => nextById.get(annotation.id) ?? annotation,
      );

      return annotationSnapshot(state, nextAnnotations);
    });
  },
  setReviewStatusForSelection: (status) => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];
    runMutation((state) => {
      if (targetIds.length === 0) return state;

      const selectedSet = new Set(targetIds);
      const updatedAt = Date.now();
      const nextAnnotations = state.annotations.map((annotation) =>
        selectedSet.has(annotation.id)
          ? withAnnotationReviewStatus(annotation, status, updatedAt)
          : annotation,
      );

      return annotationSnapshot(state, nextAnnotations);
    });
  },
  setReviewStatus: (id, status) =>
    runMutation((state) => {
      const annotation = state.annotations.find((item) => item.id === id);
      if (!annotation) return state;

      const updatedAt = Date.now();
      const nextAnnotations = state.annotations.map((item) =>
        item.id === id ? withAnnotationReviewStatus(item, status, updatedAt) : item,
      );

      return annotationSnapshot(state, nextAnnotations, state.selectedAnnotationIds, state.activeAnnotationId);
    }),

  addReviewReply: (id, content, author = 'Current User') =>
    runMutation((state) => {
      const trimmed = content.trim();
      if (!trimmed) return state;

      const annotation = state.annotations.find((item) => item.id === id);
      if (!annotation) return state;

      const updatedAt = Date.now();
      const nextAnnotations = state.annotations.map((item) =>
        item.id === id
          ? withAnnotationReviewReply(item, {
              id: uuidv4(),
              author,
              content: trimmed,
              createdAt: updatedAt,
            }, updatedAt)
          : item,
      );

      return annotationSnapshot(state, nextAnnotations, state.selectedAnnotationIds, state.activeAnnotationId);
    }),

  updateReviewReply: (id, replyId, content) =>
    runMutation((state) => {
      const text = content.trim();
      const annotation = state.annotations.find((item) => item.id === id);
      const reply = annotation?.data.review?.replies.find((item) => item.id === replyId);
      if (!text || !annotation || !reply || reply.content === text || !annotation.data.review) return state;
      const now = Date.now();
      const review = { ...annotation.data.review, updatedAt: now, replies: annotation.data.review.replies.map((item) => item.id === replyId ? { ...item, content: text, updatedAt: now } : item) };
      const next = state.annotations.map((item) => item.id === id ? { ...item, updatedAt: now, data: { ...item.data, review } } : item);
      return annotationSnapshot(state, next, state.selectedAnnotationIds, state.activeAnnotationId);
    }),

  deleteReviewReply: (id, replyId) =>
    runMutation((state) => {
      const annotation = state.annotations.find((item) => item.id === id);
      const review = annotation?.data.review;
      const reply = review?.replies.find((item) => item.id === replyId);
      if (!annotation || !review || !reply) return state;
      const now = Date.now();
      const replies = review.replies.filter((item) => item.id !== replyId).map((item) => {
        if (item.parentReplyId !== replyId) return item;
        const rest = { ...item };
        delete rest.parentReplyId;
        return reply.parentReplyId ? { ...rest, parentReplyId: reply.parentReplyId } : rest;
      });
      const nativeDeletedReplyIds = [...new Set([...(annotation.data.nativeDeletedReplyIds ?? []), replyId])];
      const next = state.annotations.map((item) => item.id === id ? {
        ...item, updatedAt: now, data: { ...item.data, nativeDeletedReplyIds, review: { ...review, replies, updatedAt: now } },
      } : item);
      return annotationSnapshot(state, next, state.selectedAnnotationIds, state.activeAnnotationId);
    }),

  toggleLockSelection: () => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];
    runMutation((state) => {
      if (targetIds.length === 0) return state;

      const selectedSet = new Set(targetIds);
      const shouldLock = state.annotations.some(
        (annotation) =>
          selectedSet.has(annotation.id) && annotation.data.locked !== true,
      );

      const nextAnnotations = state.annotations.map((annotation) =>
        selectedSet.has(annotation.id)
          ? {
              ...annotation,
              data: {
                ...annotation.data,
                locked: shouldLock,
              },
              updatedAt: Date.now(),
            }
          : annotation,
      );

      return annotationSnapshot(state, nextAnnotations);
    });
  },
  updateStyleForSelection: (stylePatch) => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];

    runMutation((state) => {
      if (targetIds.length === 0) return state;

      const selectedSet = new Set(targetIds);
      const nextAnnotations = state.annotations.map((annotation) => {
        if (!selectedSet.has(annotation.id)) return annotation;

        const guardedStylePatch = guardNativeInteropStylePatch(annotation, stylePatch);
        const patch: AnnotationData = {};
        const directKeys = [
          'backgroundColor', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
          'opacity', 'textColor', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily',
          'textAlign', 'lineHeight', 'autoSize', 'leaderStyle', 'arrowHead',
          'lineStartCap', 'lineEndCap', 'locked',
        ] as const;
        for (const key of directKeys) {
          if (Object.prototype.hasOwnProperty.call(guardedStylePatch, key)) {
            Object.assign(patch, { [key]: guardedStylePatch[key] });
          }
        }
        if (guardedStylePatch.fill !== undefined) patch.backgroundColor = guardedStylePatch.fill;
        if (guardedStylePatch.stroke !== undefined) patch.borderColor = guardedStylePatch.stroke;
        if (guardedStylePatch.strokeWidth !== undefined) patch.borderWidth = guardedStylePatch.strokeWidth;
        if (Object.keys(patch).length === 0) return annotation;
        const guarded = guardNativeInteropAnnotationPatch(annotation, { data: { ...annotation.data, ...patch } });
        if (!guarded.data) return annotation;
        return markNativeAppearanceDirty(annotation, {
          ...annotation, data: guarded.data, updatedAt: Date.now(),
        });
      });

      if (
        nextAnnotations.every(
          (annotation, index) => annotation === state.annotations[index],
        )
      ) {
        return state;
      }

      return annotationSnapshot(
        state,
        nextAnnotations,
      );
    });
  },
    };
  });
