import type { PdfRect, WriterElementV2 } from './types';
import type { WriterElementBatchPatch, WriterElementPatch } from './writerCommands';
import { useWriterV2Store } from './writerV2Store';

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

export type WriterDistributeMode = 'horizontal' | 'vertical';

const DUPLICATE_OFFSET = 16;

export function duplicateSelectedWriterElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const selected = store.elements.filter((element) =>
    store.selectedIds.includes(element.id),
  );

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No Writer V2 elements selected for duplication.',
    };
  }

  const maxZIndex = store.elements.reduce(
    (max, element) => Math.max(max, element.style.zIndex),
    0,
  );

  const now = new Date().toISOString();

  const clones = selected.map((element, index) =>
    cloneWriterElementForDuplicate(element, now, maxZIndex + index + 1),
  );

  store.dispatchWriterCommand({
    type: 'BATCH_ADD_WRITER_ELEMENTS',
    elements: clones,
    selectAll: true,
  });

  return {
    changed: true,
    ids: clones.map((element) => element.id),
    message: `Duplicated ${clones.length} Writer V2 element(s).`,
  };
}

export function deleteSelectedWriterElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const ids = [...store.selectedIds];

  if (ids.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No Writer V2 elements selected for deletion.',
    };
  }

  store.dispatchWriterCommand({
    type: 'BATCH_DELETE_WRITER_ELEMENTS',
    ids,
  });

  return {
    changed: true,
    ids,
    message: `Deleted ${ids.length} Writer V2 element(s).`,
  };
}

export function toggleLockSelectedWriterElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const selected = store.elements.filter((element) =>
    store.selectedIds.includes(element.id),
  );

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No Writer V2 elements selected for lock toggle.',
    };
  }

  const shouldLock = selected.some((element) => !element.locked);

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates: selected.map((element) => ({
      id: element.id,
      patch: {
        locked: shouldLock,
      },
    })),
    selectIds: selected.map((element) => element.id),
    activeId: selected.at(-1)?.id ?? null,
  });

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: shouldLock
      ? `Locked ${selected.length} Writer V2 element(s).`
      : `Unlocked ${selected.length} Writer V2 element(s).`,
  };
}

export function hideSelectedWriterElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const selected = store.elements.filter((element) =>
    store.selectedIds.includes(element.id),
  );

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No Writer V2 elements selected to hide.',
    };
  }

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates: selected.map((element) => ({
      id: element.id,
      patch: {
        hidden: true,
      },
    })),
    selectIds: [],
    activeId: null,
  });

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: `Hidden ${selected.length} Writer V2 element(s).`,
  };
}

export function showAllWriterElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const hidden = store.elements.filter((element) => element.hidden);

  if (hidden.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No hidden Writer V2 elements to show.',
    };
  }

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates: hidden.map((element) => ({
      id: element.id,
      patch: {
        hidden: false,
      },
    })),
    selectIds: hidden.map((element) => element.id),
    activeId: hidden.at(-1)?.id ?? null,
  });

  return {
    changed: true,
    ids: hidden.map((element) => element.id),
    message: `Showed ${hidden.length} Writer V2 element(s).`,
  };
}

export function bringSelectedWriterElementToFront(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const id = store.activeId ?? store.selectedIds.at(-1);

  if (!id) {
    return {
      changed: false,
      ids: [],
      message: 'No active Writer V2 element to bring forward.',
    };
  }

  const result = store.dispatchWriterCommand({
    type: 'BRING_WRITER_TO_FRONT',
    id,
  });

  return {
    changed: result.changed,
    ids: [id],
    message: result.reason,
  };
}

export function sendSelectedWriterElementToBack(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const id = store.activeId ?? store.selectedIds.at(-1);

  if (!id) {
    return {
      changed: false,
      ids: [],
      message: 'No active Writer V2 element to send backward.',
    };
  }

  const result = store.dispatchWriterCommand({
    type: 'SEND_WRITER_TO_BACK',
    id,
  });

  return {
    changed: result.changed,
    ids: [id],
    message: result.reason,
  };
}

export function nudgeSelectedWriterElements(
  dx: number,
  dy: number,
): WriterSelectionActionResult {
  const selected = getEditableSelection();

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No editable Writer V2 elements selected for nudging.',
    };
  }

  const updates = selected.map((element) =>
    patchRect(element, {
      x: element.rect.x + dx,
      y: element.rect.y + dy,
    }),
  );

  const store = useWriterV2Store.getState();

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates,
    selectIds: selected.map((element) => element.id),
    activeId: selected.at(-1)?.id ?? null,
  });

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: `Nudged ${selected.length} Writer V2 element(s).`,
  };
}

export function alignSelectedWriterElements(
  mode: WriterAlignMode,
): WriterSelectionActionResult {
  const selected = getEditableSelection();

  if (selected.length < 2) {
    return {
      changed: false,
      ids: selected.map((element) => element.id),
      message: 'Select at least two editable Writer V2 elements to align.',
    };
  }

  const bounds = selectionBounds(selected);

  const updates = selected.map((element) => {
    const rect = element.rect;

    switch (mode) {
      case 'left':
        return patchRect(element, { x: bounds.x });

      case 'center':
        return patchRect(element, {
          x: bounds.x + bounds.width / 2 - rect.width / 2,
        });

      case 'right':
        return patchRect(element, {
          x: bounds.x + bounds.width - rect.width,
        });

      case 'bottom':
        return patchRect(element, { y: bounds.y });

      case 'middle':
        return patchRect(element, {
          y: bounds.y + bounds.height / 2 - rect.height / 2,
        });

      case 'top':
        return patchRect(element, {
          y: bounds.y + bounds.height - rect.height,
        });
    }
  });

  const store = useWriterV2Store.getState();

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates,
    selectIds: selected.map((element) => element.id),
    activeId: selected.at(-1)?.id ?? null,
  });

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: `Aligned ${selected.length} Writer V2 element(s) to ${mode}.`,
  };
}

export function distributeSelectedWriterElements(
  mode: WriterDistributeMode,
): WriterSelectionActionResult {
  const selected = getEditableSelection();

  if (selected.length < 3) {
    return {
      changed: false,
      ids: selected.map((element) => element.id),
      message: 'Select at least three editable Writer V2 elements to distribute.',
    };
  }

  const sorted = [...selected].sort((a, b) =>
    mode === 'horizontal'
      ? a.rect.x - b.rect.x
      : a.rect.y - b.rect.y,
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (mode === 'horizontal') {
    const start = first.rect.x;
    const end = last.rect.x + last.rect.width;
    const totalWidth = sorted.reduce((sum, element) => sum + element.rect.width, 0);
    const gap = (end - start - totalWidth) / (sorted.length - 1);

    let cursor = start;
    const updates = sorted.map((element) => {
      const update = patchRect(element, { x: cursor });
      cursor += element.rect.width + gap;
      return update;
    });

    return commitDistribution(sorted, updates, mode);
  }

  const start = first.rect.y;
  const end = last.rect.y + last.rect.height;
  const totalHeight = sorted.reduce((sum, element) => sum + element.rect.height, 0);
  const gap = (end - start - totalHeight) / (sorted.length - 1);

  let cursor = start;
  const updates = sorted.map((element) => {
    const update = patchRect(element, { y: cursor });
    cursor += element.rect.height + gap;
    return update;
  });

  return commitDistribution(sorted, updates, mode);
}

function commitDistribution(
  selected: WriterElementV2[],
  updates: WriterElementBatchPatch[],
  mode: WriterDistributeMode,
): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();

  store.dispatchWriterCommand({
    type: 'BATCH_UPDATE_WRITER_ELEMENTS',
    updates,
    selectIds: selected.map((element) => element.id),
    activeId: selected.at(-1)?.id ?? null,
  });

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: `Distributed ${selected.length} Writer V2 element(s) ${mode}.`,
  };
}

function getEditableSelection(): WriterElementV2[] {
  const store = useWriterV2Store.getState();
  const ids = new Set(store.selectedIds);

  return store.elements.filter((element) =>
    ids.has(element.id) &&
    !element.locked &&
    !element.hidden,
  );
}

function selectionBounds(elements: WriterElementV2[]): PdfRect {
  const minX = Math.min(...elements.map((element) => element.rect.x));
  const minY = Math.min(...elements.map((element) => element.rect.y));
  const maxX = Math.max(...elements.map((element) => element.rect.x + element.rect.width));
  const maxY = Math.max(...elements.map((element) => element.rect.y + element.rect.height));

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
      x: element.rect.x + DUPLICATE_OFFSET,
      y: Math.max(0, element.rect.y - DUPLICATE_OFFSET),
    },
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    review: element.review ? { ...element.review } : undefined,
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
            ? {
                x: element.callout.anchorPoint.x + DUPLICATE_OFFSET,
                y: Math.max(0, element.callout.anchorPoint.y - DUPLICATE_OFFSET),
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
