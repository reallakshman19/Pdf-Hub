import { create } from 'zustand';
import type { PlacedElement, WriterTool } from './types';

const MAX_UNDO_DEPTH = 50;

interface WriterState {
  elements:    PlacedElement[];
  activeTool:  WriterTool;
  selectedIds: string[];
  activeId:    string | null;
  undoStack:   PlacedElement[][];
  redoStack:   PlacedElement[][];
}

interface WriterActions {
  addElement:              (element: PlacedElement) => void;
  updateElement:           (id: string, patch: Partial<PlacedElement>) => void;
  updateSelectedElements:  (patch: Partial<PlacedElement>) => void;
  commitElementTransform:  (preDragElements: PlacedElement[]) => void;
  removeElement:           (id: string) => void;
  removeSelection:         () => void;
  duplicateSelection:      () => void;
  setActiveTool:           (tool: WriterTool) => void;
  setSelectedId:           (id: string | null) => void;
  toggleSelection:         (id: string) => void;
  setSelection:            (ids: string[]) => void;
  clearSelection:          () => void;
  clearPage:               (pageNumber: number) => void;
  exportPage:    (pageNumber: number) => PlacedElement[];
  undo:          () => void;
  redo:          () => void;
  bringForward:  (id: string) => void;
  sendBackward:  (id: string) => void;
  bringToFront:  (id: string) => void;
  sendToBack:    (id: string) => void;
}

// Snapshot current elements to undo stack
function snapshot(elements: PlacedElement[], undoStack: PlacedElement[][]): PlacedElement[][] {
  const next = [elements.map(e => ({ ...e })), ...undoStack];
  return next.slice(0, MAX_UNDO_DEPTH);
}

export const useWriterStore = create<WriterState & WriterActions>((set, get) => ({
  elements:    [],
  activeTool:  'select',
  selectedIds: [],
  activeId:    null,
  undoStack:   [],
  redoStack:   [],

  addElement: (element) => set(s => ({
    elements:    [...s.elements, element],
    selectedIds: [element.id],
    activeId:    element.id,
    undoStack:   snapshot(s.elements, s.undoStack),
    redoStack:   [],
  })),

  updateElement: (id, patch) => set(s => ({
    elements: s.elements.map(e => e.id === id ? { ...e, ...patch } : e),
    undoStack: snapshot(s.elements, s.undoStack),
    redoStack: [],
  })),

  updateSelectedElements: (patch) => set(s => {
    if (s.selectedIds.length === 0) return {};
    return {
      elements: s.elements.map(e => s.selectedIds.includes(e.id) ? { ...e, ...patch } : e),
      undoStack: snapshot(s.elements, s.undoStack),
      redoStack: [],
    };
  }),

  commitElementTransform: (preDragElements) => set(s => {
    // We snapshot the explicitly provided PRE-drag elements.
    // The current s.elements is already the POST-drag elements.
    const newUndoStack = snapshot(preDragElements, s.undoStack);
    return {
      undoStack: newUndoStack,
      redoStack: [],
    };
  }),

  removeElement: (id) => set(s => ({
    elements:    s.elements.filter(e => e.id !== id),
    selectedIds: s.selectedIds.filter(selected => selected !== id),
    activeId:    s.activeId === id ? null : s.activeId,
    undoStack:   snapshot(s.elements, s.undoStack),
    redoStack:   [],
  })),

  removeSelection: () => set(s => ({
    elements:    s.elements.filter(e => !s.selectedIds.includes(e.id)),
    selectedIds: [],
    activeId:    null,
    undoStack:   snapshot(s.elements, s.undoStack),
    redoStack:   [],
  })),

  duplicateSelection: () => set(s => {
    if (s.selectedIds.length === 0) return {};

    const newElements: PlacedElement[] = [];
    const newIds: string[] = [];

    for (const id of s.selectedIds) {
      const el = s.elements.find(e => e.id === id);
      if (el) {
        const newId = `wel-${crypto.randomUUID()}`;
        newElements.push({
          ...el,
          id: newId,
          x: el.x + 20, // Offset duplicate slightly
          y: el.y + 20,
        });
        newIds.push(newId);
      }
    }

    return {
      elements:    [...s.elements, ...newElements],
      selectedIds: newIds,
      activeId:    newIds[0] || null,
      undoStack:   snapshot(s.elements, s.undoStack),
      redoStack:   [],
    };
  }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setSelectedId: (id) => set({
    selectedIds: id ? [id] : [],
    activeId:    id
  }),

  toggleSelection: (id) => set(s => {
    const isSelected = s.selectedIds.includes(id);
    const newIds = isSelected
      ? s.selectedIds.filter(x => x !== id)
      : [...s.selectedIds, id];
    return {
      selectedIds: newIds,
      activeId: newIds.length > 0 ? newIds[newIds.length - 1] : null,
    };
  }),

  setSelection: (ids) => set({
    selectedIds: ids,
    activeId: ids.length > 0 ? ids[ids.length - 1] : null
  }),

  clearSelection: () => set({
    selectedIds: [],
    activeId: null
  }),

  clearPage: (pageNumber) => set(s => ({
    elements:  s.elements.filter(e => e.pageNumber !== pageNumber),
    undoStack: snapshot(s.elements, s.undoStack),
    redoStack: [],
  })),

  exportPage: (pageNumber) => {
    return get().elements
      .filter(e => e.pageNumber === pageNumber)
      .sort((a, b) => a.zIndex - b.zIndex);
  },

  undo: () => set(s => {
    if (s.undoStack.length === 0) return {};
    const [prev, ...rest] = s.undoStack;
    return {
      elements:  prev,
      undoStack: rest,
      redoStack: [s.elements.map(e => ({ ...e })), ...s.redoStack].slice(0, MAX_UNDO_DEPTH),
    };
  }),

  redo: () => set(s => {
    if (s.redoStack.length === 0) return {};
    const [next, ...rest] = s.redoStack;
    return {
      elements:  next,
      undoStack: snapshot(s.elements, s.undoStack),
      redoStack: rest,
    };
  }),

  bringForward:  (id) => set(s => ({ elements: s.elements.map(e => e.id === id ? { ...e, zIndex: e.zIndex + 1 } : e) })),
  sendBackward:  (id) => set(s => ({ elements: s.elements.map(e => e.id === id ? { ...e, zIndex: Math.max(0, e.zIndex - 1) } : e) })),
  bringToFront:  (id) => set(s => {
    const maxZ = Math.max(0, ...s.elements.map(e => e.zIndex));
    return { elements: s.elements.map(e => e.id === id ? { ...e, zIndex: maxZ + 1 } : e) };
  }),
  sendToBack:    (id) => set(s => ({
    elements: s.elements.map(e =>
      e.id === id ? { ...e, zIndex: 0 } : { ...e, zIndex: e.zIndex + 1 }
    ),
  })),
}));