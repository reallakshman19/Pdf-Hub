import type {
  PdfRect,
  WriterElementV2,
} from './types';
import type {
  WriterElementBatchPatch,
  WriterElementPatch,
} from './writerCommands';
import type {
  WriterV2StoreState,
} from './writerV2Store';
import { useWriterV2Store } from './writerV2Store';
import {
  dispatchDurableWriterHelperLatest,
} from './durableWriterHelperDispatch';

export interface WriterSelectionActionResult {
  changed: boolean;
  ids: string[];
  message: string;
}

export type WriterAlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom';

export type WriterDistributeMode =
  | 'horizontal'
  | 'vertical';

const DUPLICATE_OFFSET = 16;

export async function duplicateSelectedWriterElements(): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  if (targetIds.length === 0) {
    return unchanged(
      'No Writer V2 elements selected for duplication.',
    );
  }

  let cloneIds: string[] = [];
  let cloneCount = 0;

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer duplicate selection',
      (state) => {
        const selected =
          elementsForIds(
            state,
            targetIds,
          );

        if (selected.length === 0) {
          return null;
        }

        const maxZIndex =
          state.elements.reduce(
            (max, element) =>
              Math.max(
                max,
                element.style.zIndex,
              ),
            0,
          );
        const now =
          new Date().toISOString();
        const clones = selected.map(
          (element, index) =>
            cloneWriterElementForDuplicate(
              element,
              now,
              maxZIndex + index + 1,
            ),
        );

        cloneIds = clones.map(
          (element) => element.id,
        );
        cloneCount = clones.length;

        return {
          type:
            'BATCH_ADD_WRITER_ELEMENTS',
          elements: clones,
          selectAll: true,
        };
      },
    );

  return {
    changed: result.changed,
    ids: result.changed ? cloneIds : [],
    message: result.changed
      ? `Duplicated ${cloneCount} Writer V2 element(s).`
      : result.reason,
  };
}

export async function deleteSelectedWriterElements(): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  if (targetIds.length === 0) {
    return unchanged(
      'No Writer V2 elements selected for deletion.',
    );
  }

  let deletedIds: string[] = [];

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer delete selection',
      (state) => {
        deletedIds =
          targetIds.filter((id) =>
            state.elements.some(
              (element) =>
                element.id === id,
            )
          );

        if (deletedIds.length === 0) {
          return null;
        }

        return {
          type:
            'BATCH_DELETE_WRITER_ELEMENTS',
          ids: deletedIds,
        };
      },
    );

  return {
    changed: result.changed,
    ids:
      result.changed
        ? [...deletedIds]
        : [],
    message: result.changed
      ? `Deleted ${deletedIds.length} Writer V2 element(s).`
      : result.reason,
  };
}

export async function toggleLockSelectedWriterElements(): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  if (targetIds.length === 0) {
    return unchanged(
      'No Writer V2 elements selected for lock toggle.',
    );
  }

  let affectedIds: string[] = [];
  let shouldLock = false;

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer lock selection',
      (state) => {
        const selected =
          elementsForIds(
            state,
            targetIds,
          );

        if (selected.length === 0) {
          return null;
        }

        shouldLock = selected.some(
          (element) => !element.locked,
        );
        affectedIds = selected.map(
          (element) => element.id,
        );

        return {
          type:
            'BATCH_UPDATE_WRITER_ELEMENTS',
          updates: selected.map(
            (element) => ({
              id: element.id,
              patch: {
                locked: shouldLock,
              },
            }),
          ),
          selectIds: affectedIds,
          activeId:
            affectedIds.at(-1) ?? null,
        };
      },
    );

  return {
    changed: result.changed,
    ids:
      result.changed
        ? [...affectedIds]
        : [],
    message: result.changed
      ? shouldLock
        ? `Locked ${affectedIds.length} Writer V2 element(s).`
        : `Unlocked ${affectedIds.length} Writer V2 element(s).`
      : result.reason,
  };
}

export async function hideSelectedWriterElements(): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  if (targetIds.length === 0) {
    return unchanged(
      'No Writer V2 elements selected to hide.',
    );
  }

  let affectedIds: string[] = [];

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer hide selection',
      (state) => {
        const selected =
          elementsForIds(
            state,
            targetIds,
          ).filter(
            (element) =>
              !element.hidden,
          );

        if (selected.length === 0) {
          return null;
        }

        affectedIds = selected.map(
          (element) => element.id,
        );

        return {
          type:
            'BATCH_UPDATE_WRITER_ELEMENTS',
          updates: selected.map(
            (element) => ({
              id: element.id,
              patch: {
                hidden: true,
              },
            }),
          ),
          selectIds: [],
          activeId: null,
        };
      },
    );

  return {
    changed: result.changed,
    ids:
      result.changed
        ? [...affectedIds]
        : [],
    message: result.changed
      ? `Hidden ${affectedIds.length} Writer V2 element(s).`
      : result.reason,
  };
}

export async function showAllWriterElements(): Promise<WriterSelectionActionResult> {
  let affectedIds: string[] = [];

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer show hidden elements',
      (state) => {
        const hidden =
          state.elements.filter(
            (element) => element.hidden,
          );

        if (hidden.length === 0) {
          return null;
        }

        affectedIds = hidden.map(
          (element) => element.id,
        );

        return {
          type:
            'BATCH_UPDATE_WRITER_ELEMENTS',
          updates: hidden.map(
            (element) => ({
              id: element.id,
              patch: {
                hidden: false,
              },
            }),
          ),
          selectIds: affectedIds,
          activeId:
            affectedIds.at(-1) ?? null,
        };
      },
    );

  return {
    changed: result.changed,
    ids:
      result.changed
        ? [...affectedIds]
        : [],
    message: result.changed
      ? `Showed ${affectedIds.length} Writer V2 element(s).`
      : affectedIds.length === 0
        ? 'No hidden Writer V2 elements to show.'
        : result.reason,
  };
}

export async function bringSelectedWriterElementToFront(): Promise<WriterSelectionActionResult> {
  const id = activeIdAtInvocation();

  if (!id) {
    return unchanged(
      'No active Writer V2 element to bring forward.',
    );
  }

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer bring selection to front',
      (state) =>
        state.elements.some(
          (element) => element.id === id,
        )
          ? {
              type:
                'BRING_WRITER_TO_FRONT',
              id,
            }
          : null,
    );

  return {
    changed: result.changed,
    ids: result.changed ? [id] : [],
    message: result.reason,
  };
}

export async function sendSelectedWriterElementToBack(): Promise<WriterSelectionActionResult> {
  const id = activeIdAtInvocation();

  if (!id) {
    return unchanged(
      'No active Writer V2 element to send backward.',
    );
  }

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer send selection to back',
      (state) =>
        state.elements.some(
          (element) => element.id === id,
        )
          ? {
              type:
                'SEND_WRITER_TO_BACK',
              id,
            }
          : null,
    );

  return {
    changed: result.changed,
    ids: result.changed ? [id] : [],
    message: result.reason,
  };
}

export async function nudgeSelectedWriterElements(
  dx: number,
  dy: number,
): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  return commitEditableSelectionUpdate(
    targetIds,
    'Writer nudge selection',
    (selected) =>
      selected.map((element) =>
        patchRect(element, {
          x: element.rect.x + dx,
          y: element.rect.y + dy,
        })
      ),
    (count) =>
      `Nudged ${count} Writer V2 element(s).`,
    'No editable Writer V2 elements selected for nudging.',
  );
}

export async function alignSelectedWriterElements(
  mode: WriterAlignMode,
): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  return commitEditableSelectionUpdate(
    targetIds,
    `Writer align selection ${mode}`,
    (selected) => {
      if (selected.length < 2) {
        return null;
      }

      const bounds =
        selectionBounds(selected);

      return selected.map((element) => {
        const rect = element.rect;

        switch (mode) {
          case 'left':
            return patchRect(
              element,
              { x: bounds.x },
            );

          case 'center':
            return patchRect(
              element,
              {
                x:
                  bounds.x
                  + bounds.width / 2
                  - rect.width / 2,
              },
            );

          case 'right':
            return patchRect(
              element,
              {
                x:
                  bounds.x
                  + bounds.width
                  - rect.width,
              },
            );

          case 'bottom':
            return patchRect(
              element,
              { y: bounds.y },
            );

          case 'middle':
            return patchRect(
              element,
              {
                y:
                  bounds.y
                  + bounds.height / 2
                  - rect.height / 2,
              },
            );

          case 'top':
            return patchRect(
              element,
              {
                y:
                  bounds.y
                  + bounds.height
                  - rect.height,
              },
            );
        }
      });
    },
    (count) =>
      `Aligned ${count} Writer V2 element(s) to ${mode}.`,
    'Select at least two editable Writer V2 elements to align.',
  );
}

export async function distributeSelectedWriterElements(
  mode: WriterDistributeMode,
): Promise<WriterSelectionActionResult> {
  const targetIds = selectedIdsAtInvocation();

  return commitEditableSelectionUpdate(
    targetIds,
    `Writer distribute selection ${mode}`,
    (selected) =>
      buildDistributionUpdates(
        selected,
        mode,
      ),
    (count) =>
      `Distributed ${count} Writer V2 element(s) ${mode}.`,
    'Select at least three editable Writer V2 elements to distribute.',
  );
}

async function commitEditableSelectionUpdate(
  targetIds: string[],
  context: string,
  buildUpdates: (
    selected: WriterElementV2[],
  ) =>
    | WriterElementBatchPatch[]
    | null,
  message: (count: number) => string,
  emptyMessage: string,
): Promise<WriterSelectionActionResult> {
  if (targetIds.length === 0) {
    return unchanged(emptyMessage);
  }

  let affectedIds: string[] = [];

  const result =
    await dispatchDurableWriterHelperLatest(
      context,
      (state) => {
        const selected =
          editableElementsForIds(
            state,
            targetIds,
          );
        const updates =
          buildUpdates(selected);

        if (
          !updates
          || updates.length === 0
        ) {
          return null;
        }

        affectedIds = updates.map(
          (update) => update.id,
        );

        return {
          type:
            'BATCH_UPDATE_WRITER_ELEMENTS',
          updates,
          selectIds: affectedIds,
          activeId:
            affectedIds.at(-1) ?? null,
        };
      },
    );

  return {
    changed: result.changed,
    ids:
      result.changed
        ? [...affectedIds]
        : [],
    message: result.changed
      ? message(affectedIds.length)
      : affectedIds.length === 0
        ? emptyMessage
        : result.reason,
  };
}

function buildDistributionUpdates(
  selected: WriterElementV2[],
  mode: WriterDistributeMode,
): WriterElementBatchPatch[] | null {
  if (selected.length < 3) {
    return null;
  }

  const sorted = [...selected].sort(
    (a, b) =>
      mode === 'horizontal'
        ? a.rect.x - b.rect.x
        : a.rect.y - b.rect.y,
  );

  const first = sorted[0];
  const last = sorted.at(-1)!;

  if (mode === 'horizontal') {
    const start = first.rect.x;
    const end =
      last.rect.x + last.rect.width;
    const totalWidth = sorted.reduce(
      (sum, element) =>
        sum + element.rect.width,
      0,
    );
    const gap =
      (
        end
        - start
        - totalWidth
      )
      / (sorted.length - 1);

    let cursor = start;

    return sorted.map((element) => {
      const update =
        patchRect(element, {
          x: cursor,
        });
      cursor +=
        element.rect.width + gap;
      return update;
    });
  }

  const start = first.rect.y;
  const end =
    last.rect.y + last.rect.height;
  const totalHeight = sorted.reduce(
    (sum, element) =>
      sum + element.rect.height,
    0,
  );
  const gap =
    (
      end
      - start
      - totalHeight
    )
    / (sorted.length - 1);

  let cursor = start;

  return sorted.map((element) => {
    const update =
      patchRect(element, {
        y: cursor,
      });
    cursor +=
      element.rect.height + gap;
    return update;
  });
}

function selectedIdsAtInvocation(): string[] {
  return [
    ...useWriterV2Store
      .getState()
      .selectedIds,
  ];
}

function activeIdAtInvocation(): string | null {
  const state = useWriterV2Store.getState();
  return state.activeId
    ?? state.selectedIds.at(-1)
    ?? null;
}

function elementsForIds(
  state: WriterV2StoreState,
  ids: string[],
): WriterElementV2[] {
  const idSet = new Set(ids);

  return state.elements.filter(
    (element) => idSet.has(element.id),
  );
}

function editableElementsForIds(
  state: WriterV2StoreState,
  ids: string[],
): WriterElementV2[] {
  return elementsForIds(
    state,
    ids,
  ).filter(
    (element) =>
      !element.locked
      && !element.hidden,
  );
}

function unchanged(
  message: string,
): WriterSelectionActionResult {
  return {
    changed: false,
    ids: [],
    message,
  };
}

function selectionBounds(
  elements: WriterElementV2[],
): PdfRect {
  const minX = Math.min(
    ...elements.map(
      (element) => element.rect.x,
    ),
  );
  const minY = Math.min(
    ...elements.map(
      (element) => element.rect.y,
    ),
  );
  const maxX = Math.max(
    ...elements.map(
      (element) =>
        element.rect.x
        + element.rect.width,
    ),
  );
  const maxY = Math.max(
    ...elements.map(
      (element) =>
        element.rect.y
        + element.rect.height,
    ),
  );

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function patchRect(
  element: WriterElementV2,
  rectPatch: Partial<PdfRect>,
): WriterElementBatchPatch {
  const patch: WriterElementPatch = {
    rect: {
      ...element.rect,
      ...rectPatch,
    },
  };

  return {
    id: element.id,
    patch,
  };
}

function cloneWriterElementForDuplicate(
  element: WriterElementV2,
  now: string,
  zIndex: number,
): WriterElementV2 {
  return {
    ...element,
    id: createWriterElementId(),
    rect: {
      ...element.rect,
      x:
        element.rect.x
        + DUPLICATE_OFFSET,
      y: Math.max(
        0,
        element.rect.y
        - DUPLICATE_OFFSET,
      ),
    },
    assetIds:
      element.assetIds
        ? [...element.assetIds]
        : undefined,
    review:
      element.review
        ? { ...element.review }
        : undefined,
    tableData: element.tableData
      ? {
          ...element.tableData,
          columns:
            element.tableData.columns.map(
              (column) => ({
                ...column,
                ...(column.style
                  ? {
                      style: {
                        ...column.style,
                      },
                    }
                  : {}),
              }),
            ),
          rows:
            element.tableData.rows.map(
              (row) => ({
                ...row,
                cells: row.cells.map(
                  (cell) => ({
                    ...cell,
                    ...(cell.style
                      ? {
                          style: {
                            ...cell.style,
                          },
                        }
                      : {}),
                  }),
                ),
              }),
            ),
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint:
            element.callout.anchorPoint
              ? {
                  x:
                    element.callout
                      .anchorPoint.x
                    + DUPLICATE_OFFSET,
                  y: Math.max(
                    0,
                    element.callout
                      .anchorPoint.y
                    - DUPLICATE_OFFSET,
                  ),
                }
              : undefined,
        }
      : undefined,
    style: {
      ...element.style,
      zIndex,
    },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

function createWriterElementId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `writer-v2-${globalThis.crypto.randomUUID()}`;
  }

  return `writer-v2-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
