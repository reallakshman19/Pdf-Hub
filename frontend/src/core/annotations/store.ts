import { create } from 'zustand';
import { materializePdfCommand } from '../commands/types';
import {
  recordStateTransaction,
  writerHistoryState,
} from '../document-history/stateTransaction';
import { useSessionStore } from '../session/store';
import { useWriterV2Store } from '../writer-v2/writerV2Store';

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
  toggleLockSelection: () => void;
  updateStyleForSelection: (stylePatch: Partial<AnnotationStyle>) => void;
}

function recordAnnotationMutation(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  label = 'Edit annotations',
): void {
  const session = useSessionStore.getState();
  if (!session.documentKey || !session.workingBytes) return;

  const writer = useWriterV2Store.getState();
  const annotationIds = Array.from(
    new Set([
      ...state.selectedAnnotationIds,
      ...nextAnnotations
        .filter((annotation) =>
          !state.annotations.some((current) => current === annotation)
        )
        .map((annotation) => annotation.id),
    ]),
  );

  recordStateTransaction({
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
  });
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

function snapshot(
  state: AnnotationState,
  nextAnnotations: PdfAnnotation[],
  nextSelectedIds?: string[],
  nextActiveId?: string | null,
) {
  markAnnotationDirty();
  recordAnnotationMutation(state, nextAnnotations);

  return {
    annotations: nextAnnotations,
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
  activeAnnotationId: null,
  selectedAnnotationIds: [],
  clipboard: [],

  addAnnotation: (annotation) =>
    set((state) =>
      snapshot(state, [...state.annotations, annotation], [annotation.id], annotation.id),
    ),

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

  setAnnotations: (annotations) =>
    set({
      annotations,
      selectedAnnotationIds: [],
      activeAnnotationId: null,
    }),

  applyPageRemap: (annotations) =>
    set((state) => snapshot(state, annotations, [], null)),

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
      const nextAnnotations = state.annotations.map((annotation) =>
        selectedSet.has(annotation.id)
          ? {
              ...annotation,
              data: {
                ...annotation.data,
                reviewStatus: status,
              },
              updatedAt: Date.now(),
            }
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
