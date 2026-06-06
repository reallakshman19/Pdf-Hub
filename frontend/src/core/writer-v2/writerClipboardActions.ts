import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import type { WriterSelectionActionResult } from './writerSelectionActions';

const PASTE_OFFSET = 16;

interface WriterClipboardSnapshot {
  copiedAt: string;
  elements: WriterElementV2[];
}

let clipboard: WriterClipboardSnapshot | null = null;

export function copySelectedWriterElementsToClipboard(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const selected = store.elements.filter((element) =>
    store.selectedIds.includes(element.id) && !element.hidden,
  );

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'No visible Writer V2 elements selected for copy.',
    };
  }

  clipboard = {
    copiedAt: new Date().toISOString(),
    elements: selected.map((element) => cloneClipboardElementSnapshot(element)),
  };

  return {
    changed: true,
    ids: selected.map((element) => element.id),
    message: `Copied ${selected.length} Writer V2 element(s).`,
  };
}

export function pasteWriterClipboardElements(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();

  if (!clipboard || clipboard.elements.length === 0) {
    return {
      changed: false,
      ids: [],
      message: 'Writer V2 clipboard is empty.',
    };
  }

  const maxZIndex = store.elements.reduce(
    (max, element) => Math.max(max, element.style.zIndex),
    0,
  );
  const now = new Date().toISOString();
  const clones = clipboard.elements.map((element, index) =>
    cloneClipboardElementForPaste(element, now, maxZIndex + index + 1),
  );

  store.dispatchWriterCommand({
    type: 'BATCH_ADD_WRITER_ELEMENTS',
    elements: clones,
    selectAll: true,
  });

  clipboard = {
    copiedAt: now,
    elements: clones.map((element) => cloneClipboardElementSnapshot(element)),
  };

  return {
    changed: true,
    ids: clones.map((element) => element.id),
    message: `Pasted ${clones.length} Writer V2 element(s).`,
  };
}

export function hasWriterClipboardElements(): boolean {
  return Boolean(clipboard && clipboard.elements.length > 0);
}

export function clearWriterElementClipboard(): void {
  clipboard = null;
}

function cloneClipboardElementForPaste(
  element: WriterElementV2,
  now: string,
  zIndex: number,
): WriterElementV2 {
  return {
    ...cloneClipboardElementSnapshot(element),
    id: createWriterClipboardElementId(),
    rect: {
      ...element.rect,
      x: element.rect.x + PASTE_OFFSET,
      y: Math.max(0, element.rect.y - PASTE_OFFSET),
    },
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? {
                x: element.callout.anchorPoint.x + PASTE_OFFSET,
                y: Math.max(0, element.callout.anchorPoint.y - PASTE_OFFSET),
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

function cloneClipboardElementSnapshot(element: WriterElementV2): WriterElementV2 {
  return {
    ...element,
    rect: { ...element.rect },
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    review: element.review ? { ...element.review } : undefined,
    tableData: element.tableData
      ? {
          columns: element.tableData.columns.map((column) => ({
            ...column,
            style: column.style ? { ...column.style } : undefined,
          })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              style: cell.style ? { ...cell.style } : undefined,
            })),
          })),
          hasHeaderRow: element.tableData.hasHeaderRow,
          defaultCellStyle: element.tableData.defaultCellStyle
            ? { ...element.tableData.defaultCellStyle }
            : undefined,
          headerCellStyle: element.tableData.headerCellStyle
            ? { ...element.tableData.headerCellStyle }
            : undefined,
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

function createWriterClipboardElementId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `writer-v2-${globalThis.crypto.randomUUID()}`;
  }

  return `writer-v2-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
