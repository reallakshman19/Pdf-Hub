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
  hasNativeRichTextSemantics,
} from './nativeInteropFidelity';

import { v4 as uuidv4 } from 'uuid';
import type {
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
  activeAnnotationId: string | null;
  selectedAnnotationIds: string[];
  clipboard: PdfAnnotation[];
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
  toggleLockSelection: () => void;
  updateStyleForSelection: (stylePatch: Partial<AnnotationStyle>) => void;
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
    activeAnnotationId: state.activeAnnotationId,
    selectedAnnotationIds: [
      ...state.selectedAnnotationIds,
    ],
    clipboard: [...state.clipboard],
  };
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
  activeAnnotationId: null,
  selectedAnnotationIds: [],
  clipboard: [],

  addAnnotation: (annotation) =>
    runMutation((state) => {
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

        const updated: PdfAnnotation = {
          ...annotation,
          ...guardedPatch,
          updatedAt: Date.now(),
        };

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

        const updated: PdfAnnotation = {
          ...annotation,
          ...guardedPatch,
          updatedAt: Date.now(),
        };

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
      const nextAnnotations = state.annotations.filter((annotation) => annotation.id !== id);
      const nextSelectedIds = state.selectedAnnotationIds.filter((value) => value !== id);
      const nextActiveId =
        state.activeAnnotationId === id ? nextSelectedIds[0] ?? null : state.activeAnnotationId;

      return annotationSnapshot(state, nextAnnotations, nextSelectedIds, nextActiveId);
    }),

  deleteSelection: () => {
    const targetIds = [
      ...get().selectedAnnotationIds,
    ];
    runMutation((state) => {
      if (targetIds.length === 0) return state;
      const selectedSet = new Set(targetIds);
      const nextAnnotations = state.annotations.filter(
        (annotation) => !selectedSet.has(annotation.id),
      );
      return annotationSnapshot(state, nextAnnotations, [], null);
    });
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
    set({
      annotations: normalizeAnnotationPageAnchors(
        normalizeAnnotationReviews(annotations),
        useSessionStore.getState().pageGraph,
      ),
      selectedAnnotationIds: [],
      activeAnnotationId: null,
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

      const copied = selectedAnnotations(state.annotations, ids)
        .filter((annotation) => !hasNativeRichTextSemantics(annotation))
        .map((annotation) => ({
          ...annotation,
          data: { ...annotation.data },
        }));

      return { clipboard: copied };
    }),

  pasteClipboard: (targetPage) => {
    const sourceClipboard = get().clipboard
      .filter((annotation) => !hasNativeRichTextSemantics(annotation))
      .map(
        (annotation) => ({
          ...annotation,
          rect: { ...annotation.rect },
          data: { ...annotation.data },
        }),
      );

    runMutation((state) => {
      if (sourceClipboard.length === 0) return state;

      const now = Date.now();
      const targetGraph =
        useSessionStore.getState().pageGraph;
      const pasted = sourceClipboard.map(
        (annotation, index) =>
          annotationForTargetPage(
            {
              ...annotation,
              id: uuidv4(),
              pageNumber:
                targetPage ?? annotation.pageNumber,
              rect: {
                ...annotation.rect,
                x: annotation.rect.x + 18,
                y:
                  annotation.rect.y
                  + 18
                  + index * 4,
              },
              data: {
                ...annotation.data,
                anchor:
                  annotation.data.anchor
                  && typeof annotation.data.anchor
                    === 'object'
                  && annotation.data.anchor !== null
                    ? {
                        x:
                          (annotation.data.anchor as { x: number }).x + 18,
                        y:
                          (annotation.data.anchor as { y: number }).y
                          + 18
                          + index * 4,
                      }
                    : annotation.data.anchor,
                knee:
                  annotation.data.knee
                  && typeof annotation.data.knee
                    === 'object'
                  && annotation.data.knee !== null
                    ? {
                        x:
                          (annotation.data.knee as { x: number }).x + 18,
                        y:
                          (annotation.data.knee as { y: number }).y
                          + 18
                          + index * 4,
                      }
                    : annotation.data.knee,
              },
              createdAt: now,
              updatedAt: now,
            },
            targetGraph,
            targetPage ?? annotation.pageNumber,
          ),
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
      const duplicated = selectedAnnotations(state.annotations, ids)
        .filter((annotation) => !hasNativeRichTextSemantics(annotation))
        .map((annotation, index) => ({
        ...annotation,
        id: uuidv4(),
        rect: {
          ...annotation.rect,
          x: annotation.rect.x + 20,
          y: annotation.rect.y + 20 + index * 4,
        },
        data: {
          ...annotation.data,
          anchor:
            annotation.data.anchor &&
            typeof annotation.data.anchor === 'object' &&
            annotation.data.anchor !== null
              ? {
                  x: (annotation.data.anchor as { x: number }).x + 20,
                  y: (annotation.data.anchor as { y: number }).y + 20 + index * 4,
                }
              : annotation.data.anchor,
          knee:
            annotation.data.knee &&
            typeof annotation.data.knee === 'object' &&
            annotation.data.knee !== null
              ? {
                  x: (annotation.data.knee as { x: number }).x + 20,
                  y: (annotation.data.knee as { y: number }).y + 20 + index * 4,
                }
              : annotation.data.knee,
        },
        createdAt: now,
        updatedAt: now,
      }));

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

        return {
          ...annotation,
          rect,
          updatedAt: Date.now(),
        };
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

        nextById.set(annotation.id, {
          ...annotation,
          rect,
          updatedAt: Date.now(),
        });
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

        const guardedStylePatch = guardNativeInteropStylePatch(
          annotation,
          stylePatch,
        );
        if (Object.keys(guardedStylePatch).length === 0) {
          return annotation;
        }

        return {
                ...annotation,
                data: {
                  ...annotation.data,
                  ...(guardedStylePatch.fill
                    ? {
                        backgroundColor:
                          guardedStylePatch.fill,
                      }
                    : {}),
                  ...(guardedStylePatch.stroke
                    ? {
                        borderColor:
                          guardedStylePatch.stroke,
                      }
                    : {}),
                  ...(guardedStylePatch.strokeWidth
                    !== undefined
                    ? {
                        borderWidth:
                          guardedStylePatch.strokeWidth,
                      }
                    : {}),
                  ...(guardedStylePatch.textColor
                    ? {
                        textColor:
                          guardedStylePatch.textColor,
                      }
                    : {}),
                  ...(guardedStylePatch.opacity
                    !== undefined
                    ? {
                        opacity:
                          guardedStylePatch.opacity,
                      }
                    : {}),
                  ...(guardedStylePatch.fontSize
                    !== undefined
                    ? {
                        fontSize:
                          guardedStylePatch.fontSize,
                      }
                    : {}),
                  ...(guardedStylePatch.fontWeight
                    ? {
                        fontWeight:
                          guardedStylePatch.fontWeight,
                      }
                    : {}),
                  ...(guardedStylePatch.textAlign
                    ? {
                        textAlign:
                          guardedStylePatch.textAlign,
                      }
                    : {}),
                  style: {
                    ...(annotation.data.style
                    && typeof annotation.data.style
                      === 'object'
                      ? (annotation.data.style as AnnotationStyle)
                      : {}),
                    ...guardedStylePatch,
                  },
                },
                updatedAt: Date.now(),
              };
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
