import { create } from 'zustand';
import { documentBus } from '../events/bus';
import { remapAfterReorder, remapAfterDelete, remapAfterInsert, remapAfterRotate, remapAfterDuplicate } from './pageRemapper';
import { useSessionStore } from '../session/store';
import { normalizeAnnotationReview, normalizeAnnotationReviews, withAnnotationReviewStatus } from '../review/annotationReview';

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
  history: PdfAnnotation[][];
  future: PdfAnnotation[][];
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
  undo: () => void;
  redo: () => void;
  setAnnotations: (annotations: PdfAnnotation[]) => void;
  applyPageRemap: (annotations: PdfAnnotation[]) => void;
  copySelection: () => void;
  pasteClipboard: (targetPage?: number) => void;
  duplicateSelection: () => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (mode: DistributeMode) => void;
  setReviewStatusForSelection: (status: ReviewStatus) => void;
  toggleLockSelection: () => void;
  updateStyleForSelection: (stylePatch: Partial<AnnotationStyle>) => void;
}

const MAX_HISTORY = 50;

function normalizeIds(ids: string[], annotations: PdfAnnotation[]): string[] {
  const allowed = new Set(annotations.map((annotation) => annotation.id));
  return Array.from(new Set(ids)).filter((id) => allowed.has(id));
}

function markAnnotationDirty(): void {
  useSessionStore.getState().setDirty(true);
}

function pushAnnotationHistory(state: AnnotationState): PdfAnnotation[][] {
  return [...state.history, state.annotations].slice(-MAX_HISTORY);
}

function applyAnnotationHistoryTransaction(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  nextSelectedIds: string[] = [],
  nextActiveId: string | null = null,
): Partial<AnnotationState> {
  markAnnotationDirty();

  return {
    annotations: nextAnnotations,
    history: pushAnnotationHistory(state),
    future: [],
    selectedAnnotationIds: normalizeIds(nextSelectedIds, nextAnnotations),
    activeAnnotationId:
      nextActiveId && normalizeIds([nextActiveId], nextAnnotations).length > 0
        ? nextActiveId
        : normalizeIds(nextSelectedIds, nextAnnotations)[0] ?? null,
  };
}

function clearAnnotationInteractionState(): Pick<
  AnnotationState,
  'selectedAnnotationIds' | 'activeAnnotationId'
> {
  return {
    selectedAnnotationIds: [],
    activeAnnotationId: null,
  };
}

function selectedAnnotations(
  annotations: PdfAnnotation[],
  ids: string[],
): PdfAnnotation[] {
  const idSet = new Set(ids);
  return annotations.filter((annotation) => idSet.has(annotation.id));
}

function snapshot(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  nextSelectedIds?: string[],
  nextActiveId?: string | null,
) {
  useSessionStore.getState().setDirty(true);
  return {
    annotations: nextAnnotations,
    history: [...state.history, state.annotations].slice(-MAX_HISTORY),
    future: [],
    selectedAnnotationIds: normalizeIds(
      nextSelectedIds ?? state.selectedAnnotationIds,
      nextAnnotations,
    ),
    activeAnnotationId:
      nextActiveId !== undefined
        ? nextActiveId
        : normalizeIds(state.selectedAnnotationIds, nextAnnotations)[0] ?? null,
  };
}

export const useAnnotationStore = create<AnnotationState & AnnotationActions>((set) => ({
  annotations: [],
  history: [],
  future: [],
  activeAnnotationId: null,
  selectedAnnotationIds: [],
  clipboard: [],

  addAnnotation: (annotation) =>
    set((state) => {
      const normalizedAnnotation = normalizeAnnotationReview(annotation);
      return snapshot(
        state,
        [...state.annotations, normalizedAnnotation],
        [normalizedAnnotation.id],
        normalizedAnnotation.id,
      );
    }),

  updateAnnotation: (id, data) =>
    set((state) => {
      const nextAnnotations = state.annotations.map((annotation) =>
        annotation.id === id
          ? {
              ...annotation,
              ...data,
              updatedAt: Date.now(),
            }
          : annotation,
      );

      return snapshot(state, nextAnnotations);
    }),

  updateManyAnnotations: (updates) =>
    set((state) => {
      const patchMap = new Map(updates.map((entry) => [entry.id, entry.data]));
      const nextAnnotations = state.annotations.map((annotation) => {
        const patch = patchMap.get(annotation.id);
        return patch
          ? {
              ...annotation,
              ...patch,
              updatedAt: Date.now(),
            }
          : annotation;
      });

      return snapshot(state, nextAnnotations);
    }),

  deleteAnnotation: (id) =>
    set((state) => {
      const nextAnnotations = state.annotations.filter((annotation) => annotation.id !== id);
      const nextSelectedIds = state.selectedAnnotationIds.filter((value) => value !== id);
      const nextActiveId =
        state.activeAnnotationId === id ? nextSelectedIds[0] ?? null : state.activeAnnotationId;

      return snapshot(state, nextAnnotations, nextSelectedIds, nextActiveId);
    }),

  deleteSelection: () =>
    set((state) => {
      if (state.selectedAnnotationIds.length === 0) return state;
      const selectedSet = new Set(state.selectedAnnotationIds);
      const nextAnnotations = state.annotations.filter(
        (annotation) => !selectedSet.has(annotation.id),
      );
      return snapshot(state, nextAnnotations, [], null);
    }),

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

  undo: () =>
    set((state) => {
      if (state.history.length === 0) return state;
      markAnnotationDirty();
      const previous = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);
      const newFuture = [state.annotations, ...state.future].slice(0, MAX_HISTORY);
      return {
        annotations: previous,
        history: newHistory,
        future: newFuture,
        ...clearAnnotationInteractionState(),
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      markAnnotationDirty();
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const newHistory = pushAnnotationHistory(state);
      return {
        annotations: next,
        history: newHistory,
        future: newFuture,
        ...clearAnnotationInteractionState(),
      };
    }),

  setAnnotations: (annotations) =>
    set({
      annotations: normalizeAnnotationReviews(annotations),
      history: [],
      future: [],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    }),

  applyPageRemap: (annotations) =>
    set((state) => applyAnnotationHistoryTransaction(state, annotations, [], null)),

  copySelection: () =>
    set((state) => {
      const ids =
        state.selectedAnnotationIds.length > 0
          ? state.selectedAnnotationIds
          : state.activeAnnotationId
          ? [state.activeAnnotationId]
          : [];

      const copied = selectedAnnotations(state.annotations, ids).map((annotation) => ({
        ...annotation,
        data: { ...annotation.data },
      }));

      return { clipboard: copied };
    }),

  pasteClipboard: (targetPage) =>
    set((state) => {
      if (state.clipboard.length === 0) return state;

      const now = Date.now();
      const pasted = state.clipboard.map((annotation, index) => ({
        ...annotation,
        id: uuidv4(),
        pageNumber: targetPage ?? annotation.pageNumber,
        rect: {
          ...annotation.rect,
          x: annotation.rect.x + 18,
          y: annotation.rect.y + 18 + index * 4,
        },
        data: {
          ...annotation.data,
          anchor:
            annotation.data.anchor &&
            typeof annotation.data.anchor === 'object' &&
            annotation.data.anchor !== null
              ? {
                  x: (annotation.data.anchor as { x: number }).x + 18,
                  y: (annotation.data.anchor as { y: number }).y + 18 + index * 4,
                }
              : annotation.data.anchor,
          knee:
            annotation.data.knee &&
            typeof annotation.data.knee === 'object' &&
            annotation.data.knee !== null
              ? {
                  x: (annotation.data.knee as { x: number }).x + 18,
                  y: (annotation.data.knee as { y: number }).y + 18 + index * 4,
                }
              : annotation.data.knee,
        },
        createdAt: now,
        updatedAt: now,
      }));

      return snapshot(
        state,
        [...state.annotations, ...pasted],
        pasted.map((annotation) => annotation.id),
        pasted[0]?.id ?? null,
      );
    }),

  duplicateSelection: () =>
    set((state) => {
      const ids =
        state.selectedAnnotationIds.length > 0
          ? state.selectedAnnotationIds
          : state.activeAnnotationId
          ? [state.activeAnnotationId]
          : [];

      if (ids.length === 0) return state;

      const now = Date.now();
      const duplicated = selectedAnnotations(state.annotations, ids).map((annotation, index) => ({
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

      return snapshot(
        state,
        [...state.annotations, ...duplicated],
        duplicated.map((annotation) => annotation.id),
        duplicated[0]?.id ?? null,
      );
    }),

  alignSelection: (mode) =>
    set((state) => {
      if (state.selectedAnnotationIds.length < 2) return state;

      const selected = selectedAnnotations(state.annotations, state.selectedAnnotationIds);
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

      const selectedSet = new Set(state.selectedAnnotationIds);

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

      return snapshot(state, nextAnnotations);
    }),

  distributeSelection: (mode) =>
    set((state) => {
      if (state.selectedAnnotationIds.length < 3) return state;

      const selected = selectedAnnotations(state.annotations, state.selectedAnnotationIds).filter(
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

      return snapshot(state, nextAnnotations);
    }),

  setReviewStatusForSelection: (status) =>
    set((state) => {
      if (state.selectedAnnotationIds.length === 0) return state;

      const selectedSet = new Set(state.selectedAnnotationIds);
      const updatedAt = Date.now();
      const nextAnnotations = state.annotations.map((annotation) =>
        selectedSet.has(annotation.id)
          ? withAnnotationReviewStatus(annotation, status, updatedAt)
          : annotation,
      );

      return snapshot(state, nextAnnotations);
    }),

  toggleLockSelection: () =>
    set((state) => {
      if (state.selectedAnnotationIds.length === 0) return state;

      const selectedSet = new Set(state.selectedAnnotationIds);
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

      return snapshot(state, nextAnnotations);
    }),

  updateStyleForSelection: (stylePatch) =>
    set((state) => {
      if (state.selectedAnnotationIds.length === 0) return state;

      const selectedSet = new Set(state.selectedAnnotationIds);
      const nextAnnotations = state.annotations.map((annotation) =>
        selectedSet.has(annotation.id)
          ? {
              ...annotation,
              data: {
                ...annotation.data,
                ...(stylePatch.fill ? { backgroundColor: stylePatch.fill } : {}),
                ...(stylePatch.stroke ? { borderColor: stylePatch.stroke } : {}),
                ...(stylePatch.strokeWidth !== undefined
                  ? { borderWidth: stylePatch.strokeWidth }
                  : {}),
                ...(stylePatch.textColor ? { textColor: stylePatch.textColor } : {}),
                ...(stylePatch.opacity !== undefined
                  ? { opacity: stylePatch.opacity }
                  : {}),
                ...(stylePatch.fontSize !== undefined
                  ? { fontSize: stylePatch.fontSize }
                  : {}),
                ...(stylePatch.fontWeight
                  ? { fontWeight: stylePatch.fontWeight }
                  : {}),
                ...(stylePatch.textAlign ? { textAlign: stylePatch.textAlign } : {}),
                style: {
                  ...(annotation.data.style &&
                  typeof annotation.data.style === 'object'
                    ? (annotation.data.style as AnnotationStyle)
                    : {}),
                  ...stylePatch,
                },
              },
              updatedAt: Date.now(),
            }
          : annotation,
      );

      return snapshot(state, nextAnnotations);
    }),
}));

// Register pure page lifecycle event remappers
documentBus.subscribe((event) => {
  if (event.type === 'PAGES_REORDERED') {
    useAnnotationStore.setState((state) =>
      applyAnnotationHistoryTransaction(state, remapAfterReorder(state.annotations, event.order), [], null),
    );
    return;
  }

  if (event.type === 'PAGES_DELETED') {
    useAnnotationStore.setState((state) =>
      applyAnnotationHistoryTransaction(state, remapAfterDelete(state.annotations, event.indices), [], null),
    );
    return;
  }

  if (event.type === 'PAGES_INSERTED') {
    useAnnotationStore.setState((state) =>
      applyAnnotationHistoryTransaction(
        state,
        remapAfterInsert(state.annotations, event.atIndex, event.count),
        [],
        null,
      ),
    );
    return;
  }

  if (event.type === 'PAGES_ROTATED') {
    useAnnotationStore.setState((state) =>
      applyAnnotationHistoryTransaction(state, remapAfterRotate(state.annotations, event.rotations), [], null),
    );
    return;
  }

  if (event.type === 'PAGES_DUPLICATED') {
    useAnnotationStore.setState((state) =>
      applyAnnotationHistoryTransaction(state, remapAfterDuplicate(state.annotations, event.pageIndices), [], null),
    );
    return;
  }

  if (event.type === 'DOCUMENT_REPLACED') {
    useAnnotationStore.setState({
      annotations: [],
      history: [],
      future: [],
      selectedAnnotationIds: [],
      activeAnnotationId: null,
      clipboard: [],
    });
  }
});
