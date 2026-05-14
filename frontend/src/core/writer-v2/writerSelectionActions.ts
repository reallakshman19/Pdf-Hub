import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';

export interface WriterSelectionActionResult {
  changed: boolean;
  ids: string[];
  message: string;
}

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

  const clones = selected.map((element, index) => cloneWriterElementForDuplicate(
    element,
    now,
    maxZIndex + index + 1,
  ));

  for (const clone of clones) {
    store.dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: clone,
    });
  }

  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_WRITER_SELECTION',
    ids: clones.map((element) => element.id),
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

  for (const id of ids) {
    store.dispatchWriterCommand({
      type: 'DELETE_WRITER_ELEMENT',
      id,
    });
  }

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

  for (const element of selected) {
    store.dispatchWriterCommand({
      type: 'LOCK_WRITER_ELEMENT',
      id: element.id,
      locked: shouldLock,
    });
  }

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
  const ids = [...store.selectedIds];

  if (ids.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No Writer V2 elements selected to hide.',
    };
  }

  for (const id of ids) {
    store.dispatchWriterCommand({
      type: 'HIDE_WRITER_ELEMENT',
      id,
      hidden: true,
    });
  }

  return {
    changed: true,
    ids,
    message: `Hidden ${ids.length} Writer V2 element(s).`,
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