import type { WriterElementV2 } from './types';
import type { WriterCommand } from './writerCommands';
import {
  clampRectToBounds,
  commandTimestamp,
  isMutationCommand,
  moveRect,
  normalizePdfRectForCommand,
  normalizeZIndex,
  uniqueIds,
} from './writerCommands';

export interface WriterV2State {
  elements: WriterElementV2[];
  selectedIds: string[];
  activeId: string | null;
  undoStack: WriterV2Snapshot[];
  redoStack: WriterV2Snapshot[];
  dirty: boolean;
}

export interface WriterV2Snapshot {
  elements: WriterElementV2[];
  selectedIds: string[];
  activeId: string | null;
}

export interface WriterV2CommandResult {
  state: WriterV2State;
  changed: boolean;
  reason: string;
}

export const WRITER_V2_MAX_UNDO_DEPTH = 50;

export function createInitialWriterV2State(
  initial?: Partial<WriterV2State>,
): WriterV2State {
  return {
    elements: cloneElements(initial?.elements ?? []),
    selectedIds: [...(initial?.selectedIds ?? [])],
    activeId: initial?.activeId ?? null,
    undoStack: cloneSnapshots(initial?.undoStack ?? []),
    redoStack: cloneSnapshots(initial?.redoStack ?? []),
    dirty: initial?.dirty ?? false,
  };
}

export function executeWriterCommand(
  state: WriterV2State,
  command: WriterCommand,
): WriterV2CommandResult {
  const timestamp = commandTimestamp(command);

  const result = applyCommand(state, command, timestamp);

  if (!result.changed) {
    return result;
  }

  if (!isMutationCommand(command)) {
    return {
      state: result.state,
      changed: true,
      reason: result.reason,
    };
  }

  return {
    state: {
      ...result.state,
      undoStack: pushUndoSnapshot(state.undoStack, snapshotState(state)),
      redoStack: [],
      dirty: true,
    },
    changed: true,
    reason: result.reason,
  };
}

export function undoWriterCommand(state: WriterV2State): WriterV2CommandResult {
  if (state.undoStack.length === 0) {
    return {
      state: cloneState(state),
      changed: false,
      reason: 'No writer-v2 undo entry available.',
    };
  }

  const [previous, ...rest] = state.undoStack;

  return {
    state: {
      ...cloneState(state),
      elements: cloneElements(previous.elements),
      selectedIds: [...previous.selectedIds],
      activeId: previous.activeId,
      undoStack: cloneSnapshots(rest),
      redoStack: pushRedoSnapshot(state.redoStack, snapshotState(state)),
      dirty: true,
    },
    changed: true,
    reason: 'Undid writer-v2 command.',
  };
}

export function redoWriterCommand(state: WriterV2State): WriterV2CommandResult {
  if (state.redoStack.length === 0) {
    return {
      state: cloneState(state),
      changed: false,
      reason: 'No writer-v2 redo entry available.',
    };
  }

  const [next, ...rest] = state.redoStack;

  return {
    state: {
      ...cloneState(state),
      elements: cloneElements(next.elements),
      selectedIds: [...next.selectedIds],
      activeId: next.activeId,
      undoStack: pushUndoSnapshot(state.undoStack, snapshotState(state)),
      redoStack: cloneSnapshots(rest),
      dirty: true,
    },
    changed: true,
    reason: 'Redid writer-v2 command.',
  };
}

export function getWriterElementById(
  state: WriterV2State,
  id: string,
): WriterElementV2 | null {
  return state.elements.find((element) => element.id === id) ?? null;
}

export function getVisibleWriterElements(
  state: WriterV2State,
  pageIndex?: number,
): WriterElementV2[] {
  return state.elements
    .filter((element) => !element.hidden)
    .filter((element) => pageIndex === undefined || element.pageIndex === pageIndex)
    .slice()
    .sort((a, b) => a.style.zIndex - b.style.zIndex);
}

export function canEditWriterElement(element: WriterElementV2): boolean {
  return !element.locked && !element.hidden;
}

function applyCommand(
  state: WriterV2State,
  command: WriterCommand,
  timestamp: string,
): WriterV2CommandResult {
  switch (command.type) {
    case 'ADD_WRITER_ELEMENT': {
      if (state.elements.some((element) => element.id === command.element.id)) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.element.id}" already exists.`,
        };
      }

      const element = cloneElement(command.element);

      return {
        state: {
          ...state,
          elements: [...state.elements, element],
          selectedIds: [element.id],
          activeId: element.id,
        },
        changed: true,
        reason: `Added writer element "${element.id}".`,
      };
    }

    case 'UPDATE_WRITER_ELEMENT': {
      const target = getWriterElementById(state, command.id);

      if (!target || !canEditWriterElement(target)) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" cannot be updated.`,
        };
      }

      return mapWritableElement(
        state,
        command.id,
        (element) => ({
          ...element,
          ...command.patch,
          id: element.id,
          documentFingerprint: element.documentFingerprint,
          createdAt: element.createdAt,
          updatedAt: timestamp,
          rect: command.patch.rect
            ? normalizePdfRectForCommand(command.patch.rect)
            : element.rect,
          style: {
            ...element.style,
            ...(command.patch.style ?? {}),
            zIndex: normalizeZIndex(
              command.patch.style?.zIndex ?? element.style.zIndex,
            ),
          },
        }),
        `Updated writer element "${command.id}".`,
      );
    }

    case 'DELETE_WRITER_ELEMENT': {
      const exists = state.elements.some((element) => element.id === command.id);

      if (!exists) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" does not exist.`,
        };
      }

      const elements = state.elements.filter((element) => element.id !== command.id);
      const selectedIds = state.selectedIds.filter((id) => id !== command.id);

      return {
        state: {
          ...state,
          elements,
          selectedIds,
          activeId: state.activeId === command.id
            ? selectedIds.at(-1) ?? null
            : state.activeId,
        },
        changed: true,
        reason: `Deleted writer element "${command.id}".`,
      };
    }

    case 'MOVE_WRITER_ELEMENT': {
      const target = getWriterElementById(state, command.id);

      if (!target || !canEditWriterElement(target)) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" cannot be moved.`,
        };
      }

      return mapWritableElement(
        state,
        command.id,
        (element) => ({
          ...element,
          rect: moveRect(
            element.rect,
            {
              x: command.dx,
              y: command.dy,
            },
            command.pageBounds,
          ),
          updatedAt: timestamp,
        }),
        `Moved writer element "${command.id}".`,
      );
    }

    case 'RESIZE_WRITER_ELEMENT': {
      const target = getWriterElementById(state, command.id);

      if (!target || !canEditWriterElement(target)) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" cannot be resized.`,
        };
      }

      return mapWritableElement(
        state,
        command.id,
        (element) => ({
          ...element,
          rect: clampRectToBounds(command.rect, command.pageBounds),
          updatedAt: timestamp,
        }),
        `Resized writer element "${command.id}".`,
      );
    }

    case 'LOCK_WRITER_ELEMENT': {
      const target = getWriterElementById(state, command.id);

      if (!target) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" does not exist.`,
        };
      }

      return mapElement(
        state,
        command.id,
        (element) => ({
          ...element,
          locked: command.locked,
          updatedAt: timestamp,
        }),
        `Set writer element "${command.id}" locked=${command.locked}.`,
      );
    }

    case 'HIDE_WRITER_ELEMENT': {
      const target = getWriterElementById(state, command.id);

      if (!target) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" does not exist.`,
        };
      }

      const nextSelectedIds = command.hidden
        ? state.selectedIds.filter((id) => id !== command.id)
        : state.selectedIds;

      return mapElement(
        {
          ...state,
          selectedIds: nextSelectedIds,
          activeId: command.hidden && state.activeId === command.id
            ? nextSelectedIds.at(-1) ?? null
            : state.activeId,
        },
        command.id,
        (element) => ({
          ...element,
          hidden: command.hidden,
          updatedAt: timestamp,
        }),
        `Set writer element "${command.id}" hidden=${command.hidden}.`,
      );
    }

    case 'SET_WRITER_Z_INDEX': {
      const target = getWriterElementById(state, command.id);

      if (!target || target.locked) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" z-index cannot be changed.`,
        };
      }

      return mapElement(
        state,
        command.id,
        (element) => ({
          ...element,
          style: {
            ...element.style,
            zIndex: normalizeZIndex(command.zIndex),
          },
          updatedAt: timestamp,
        }),
        `Set writer element "${command.id}" z-index.`,
      );
    }

    case 'BRING_WRITER_FORWARD':
      return shiftZIndex(state, command.id, 1, timestamp);

    case 'SEND_WRITER_BACKWARD':
      return shiftZIndex(state, command.id, -1, timestamp);

    case 'BRING_WRITER_TO_FRONT':
      return setExtremeZIndex(state, command.id, 'front', timestamp);

    case 'SEND_WRITER_TO_BACK':
      return setExtremeZIndex(state, command.id, 'back', timestamp);

    case 'SET_ACTIVE_WRITER_ELEMENT': {
      if (command.id !== null && !state.elements.some((element) => element.id === command.id)) {
        return {
          state,
          changed: false,
          reason: `Writer element "${command.id}" does not exist.`,
        };
      }

      return {
        state: {
          ...state,
          activeId: command.id,
          selectedIds: command.id ? [command.id] : [],
        },
        changed: true,
        reason: 'Set active writer element.',
      };
    }

    case 'SET_WRITER_SELECTION': {
      const existing = new Set(state.elements.map((element) => element.id));
      const ids = uniqueIds(command.ids).filter((id) => existing.has(id));

      return {
        state: {
          ...state,
          selectedIds: ids,
          activeId: ids.at(-1) ?? null,
        },
        changed: true,
        reason: 'Set writer selection.',
      };
    }

    case 'CLEAR_WRITER_SELECTION':
      return {
        state: {
          ...state,
          selectedIds: [],
          activeId: null,
        },
        changed: true,
        reason: 'Cleared writer selection.',
      };

    case 'BATCH_ADD_WRITER_ELEMENTS': {
      const existingIds = new Set(state.elements.map((element) => element.id));
      const toAdd = command.elements.filter((element) => !existingIds.has(element.id)).map(cloneElement);

      if (toAdd.length === 0) {
        return {
          state,
          changed: false,
          reason: 'No new elements to batch-add.',
        };
      }

      const addedIds = toAdd.map((element) => element.id);

      return {
        state: {
          ...state,
          elements: [...state.elements, ...toAdd],
          selectedIds: command.selectAll !== false ? addedIds : state.selectedIds,
          activeId: command.selectAll !== false ? (addedIds.at(-1) ?? state.activeId) : state.activeId,
        },
        changed: true,
        reason: `Batch-added ${toAdd.length} writer element(s).`,
      };
    }

    case 'BATCH_DELETE_WRITER_ELEMENTS': {
      const idsToDelete = new Set(command.ids);
      const elements = state.elements.filter((element) => !idsToDelete.has(element.id));
      const selectedIds = state.selectedIds.filter((id) => !idsToDelete.has(id));

      return {
        state: {
          ...state,
          elements,
          selectedIds,
          activeId: idsToDelete.has(state.activeId ?? '') ? (selectedIds.at(-1) ?? null) : state.activeId,
        },
        changed: true,
        reason: `Batch-deleted ${command.ids.length} writer element(s).`,
      };
    }
  }
}

function mapWritableElement(
  state: WriterV2State,
  id: string,
  mapper: (element: WriterElementV2) => WriterElementV2,
  reason: string,
): WriterV2CommandResult {
  const target = getWriterElementById(state, id);

  if (!target || !canEditWriterElement(target)) {
    return {
      state,
      changed: false,
      reason: `Writer element "${id}" cannot be edited.`,
    };
  }

  return mapElement(state, id, mapper, reason);
}

function mapElement(
  state: WriterV2State,
  id: string,
  mapper: (element: WriterElementV2) => WriterElementV2,
  reason: string,
): WriterV2CommandResult {
  return {
    state: {
      ...state,
      elements: state.elements.map((element) => {
        // Only clone the element being mutated; leave others by reference
        return element.id === id ? mapper(cloneElement(element)) : element;
      }),
    },
    changed: true,
    reason,
  };
}

function shiftZIndex(
  state: WriterV2State,
  id: string,
  delta: number,
  timestamp: string,
): WriterV2CommandResult {
  const target = getWriterElementById(state, id);

  if (!target || target.locked) {
    return {
      state,
      changed: false,
      reason: `Writer element "${id}" z-index cannot be shifted.`,
    };
  }

  return mapElement(
    state,
    id,
    (element) => ({
      ...element,
      style: {
        ...element.style,
        zIndex: normalizeZIndex(element.style.zIndex + delta),
      },
      updatedAt: timestamp,
    }),
    `Shifted writer element "${id}" z-index.`,
  );
}

function setExtremeZIndex(
  state: WriterV2State,
  id: string,
  direction: 'front' | 'back',
  timestamp: string,
): WriterV2CommandResult {
  const target = getWriterElementById(state, id);

  if (!target || target.locked) {
    return {
      state,
      changed: false,
      reason: `Writer element "${id}" z-index cannot be changed.`,
    };
  }

  const values = state.elements.map((element) => element.style.zIndex);
  const nextZIndex = direction === 'front'
    ? Math.max(0, ...values) + 1
    : 0;

  if (direction === 'back') {
    // Only shift other elements up when the minimum z-index is already 0
    // (prevents infinite z-index inflation on repeated send-to-back calls)
    const otherValues = values.filter((_, i) => state.elements[i].id !== id);
    const minOther = otherValues.length > 0 ? Math.min(...otherValues) : 1;
    const shouldShiftOthers = minOther === 0;

    return mapElement(
      shouldShiftOthers
        ? {
            ...state,
            elements: state.elements.map((element) => {
              return element.id === id
                ? element
                : {
                    ...element,
                    style: {
                      ...element.style,
                      zIndex: element.style.zIndex + 1,
                    },
                  };
            }),
          }
        : state,
      id,
      (element) => ({
        ...element,
        style: {
          ...element.style,
          zIndex: nextZIndex,
        },
        updatedAt: timestamp,
      }),
      `Moved writer element "${id}" to ${direction}.`,
    );
  }

  return mapElement(
    state,
    id,
    (element) => ({
      ...element,
      style: {
        ...element.style,
        zIndex: nextZIndex,
      },
      updatedAt: timestamp,
    }),
    `Moved writer element "${id}" to ${direction}.`,
  );
}

function pushUndoSnapshot(
  stack: WriterV2Snapshot[],
  snapshot: WriterV2Snapshot,
): WriterV2Snapshot[] {
  return [cloneSnapshot(snapshot), ...cloneSnapshots(stack)]
    .slice(0, WRITER_V2_MAX_UNDO_DEPTH);
}

function pushRedoSnapshot(
  stack: WriterV2Snapshot[],
  snapshot: WriterV2Snapshot,
): WriterV2Snapshot[] {
  return [cloneSnapshot(snapshot), ...cloneSnapshots(stack)]
    .slice(0, WRITER_V2_MAX_UNDO_DEPTH);
}

function snapshotState(state: WriterV2State): WriterV2Snapshot {
  return {
    elements: cloneElements(state.elements),
    selectedIds: [...state.selectedIds],
    activeId: state.activeId,
  };
}

function cloneState(state: WriterV2State): WriterV2State {
  return {
    elements: cloneElements(state.elements),
    selectedIds: [...state.selectedIds],
    activeId: state.activeId,
    undoStack: cloneSnapshots(state.undoStack),
    redoStack: cloneSnapshots(state.redoStack),
    dirty: state.dirty,
  };
}

function cloneSnapshots(snapshots: WriterV2Snapshot[]): WriterV2Snapshot[] {
  return snapshots.map(cloneSnapshot);
}

function cloneSnapshot(snapshot: WriterV2Snapshot): WriterV2Snapshot {
  return {
    elements: cloneElements(snapshot.elements),
    selectedIds: [...snapshot.selectedIds],
    activeId: snapshot.activeId,
  };
}

function cloneElements(elements: WriterElementV2[]): WriterElementV2[] {
  return elements.map(cloneElement);
}

function cloneElement(element: WriterElementV2): WriterElementV2 {
  return {
    ...element,
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    rect: { ...element.rect },
    tableData: element.tableData
      ? {
          columns: element.tableData.columns.map((column) => ({ ...column })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        }
      : undefined,
    style: { ...element.style },
  };
}
