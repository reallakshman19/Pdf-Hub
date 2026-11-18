import type {
  WriterElementV2,
} from './types';
import { useWriterV2Store } from './writerV2Store';
import type { WriterV2StoreState } from './writerV2Store';
import type {
  WriterSelectionActionResult,
} from './writerSelectionActions';
import {
  dispatchDurableWriterHelperLatest,
} from './durableWriterHelperDispatch';

const PASTE_OFFSET = 16;

interface WriterClipboardSnapshot {
  copiedAt: string;
  /** The clipboard is valid only for the originating Writer document. */
  documentFingerprint: string;
  elements: WriterElementV2[];
}

let clipboard:
  | WriterClipboardSnapshot
  | null = null;

export function copySelectedWriterElementsToClipboard(): WriterSelectionActionResult {
  const store = useWriterV2Store.getState();
  const selected = store.elements.filter(
    (element) =>
      store.selectedIds.includes(
        element.id,
      )
      && !element.hidden,
  );

  if (selected.length === 0) {
    return {
      changed: false,
      ids: [],
      message:
        'No visible Writer V2 elements selected for copy.',
    };
  }

  const documentFingerprint = activeWriterDocumentFingerprint(store);
  if (
    !documentFingerprint
    || selected.some((element) => element.documentFingerprint !== documentFingerprint)
  ) {
    return {
      changed: false,
      ids: [],
      message: 'Writer clipboard selection does not match the active document identity.',
    };
  }

  if (!referencedAssetsBelongToDocument(store, selected, documentFingerprint)) {
    return {
      changed: false,
      ids: [],
      message: 'Writer clipboard contains a missing or foreign image asset.',
    };
  }

  clipboard = {
    copiedAt: new Date().toISOString(),
    documentFingerprint,
    elements: selected.map(
      (element) =>
        cloneClipboardElementSnapshot(
          element,
        ),
    ),
  };

  return {
    changed: true,
    ids: selected.map(
      (element) => element.id,
    ),
    message:
      `Copied ${selected.length} Writer V2 element(s).`,
  };
}

export async function pasteWriterClipboardElements(): Promise<WriterSelectionActionResult> {
  // Capture both the payload and its owner at invocation. Never rebind it
  // to a different Writer session while a durable command is queued.
  const capturedClipboard = clipboard;
  const sourceElements =
    capturedClipboard?.elements.map(
      (element) =>
        cloneClipboardElementSnapshot(
          element,
        ),
    ) ?? [];

  if (sourceElements.length === 0) {
    return {
      changed: false,
      ids: [],
      message:
        'Writer V2 clipboard is empty.',
    };
  }

  const ownerFingerprint = capturedClipboard?.documentFingerprint ?? '';
  const initialRejection = writerClipboardPasteRejection(
    useWriterV2Store.getState(),
    ownerFingerprint,
    sourceElements,
  );
  if (initialRejection) {
    return {
      changed: false,
      ids: [],
      message: initialRejection,
    };
  }

  let pasted: WriterElementV2[] = [];
  let queuedRejection: string | null = null;

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer clipboard paste',
      (state) => {
        // Revalidate in the latest-state command factory: document or asset
        // ownership can change between the UI gesture and journal admission.
        queuedRejection = writerClipboardPasteRejection(
          state,
          ownerFingerprint,
          sourceElements,
        );
        if (queuedRejection) return null;

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

        pasted = sourceElements.map(
          (element, index) =>
            cloneClipboardElementForPaste(
              element,
              now,
              maxZIndex + index + 1,
            ),
        );

        return {
          type:
            'BATCH_ADD_WRITER_ELEMENTS',
          elements: pasted,
          selectAll: true,
        };
      },
    );

  if (result.changed && clipboard === capturedClipboard) {
    const now = new Date().toISOString();

    clipboard = {
      copiedAt: now,
      documentFingerprint: ownerFingerprint,
      elements: pasted.map(
        (element) =>
          cloneClipboardElementSnapshot(
            element,
          ),
      ),
    };
  }

  return {
    changed: result.changed,
    ids: result.changed
      ? pasted.map(
          (element) => element.id,
        )
      : [],
    message: result.changed
      ? `Pasted ${pasted.length} Writer V2 element(s).`
      : queuedRejection ?? result.reason,
  };
}

/** Fail closed on foreign document owners or dangling/foreign image assets. */
function writerClipboardPasteRejection(
  state: WriterV2StoreState,
  ownerFingerprint: string,
  elements: WriterElementV2[],
): string | null {
  const activeFingerprint = activeWriterDocumentFingerprint(state);
  if (
    !ownerFingerprint
    || !activeFingerprint
    || activeFingerprint !== ownerFingerprint
    || elements.some((element) => element.documentFingerprint !== ownerFingerprint)
  ) {
    return 'Writer clipboard belongs to a different document identity; paste rejected.';
  }

  if (!referencedAssetsBelongToDocument(state, elements, ownerFingerprint)) {
    return 'Writer clipboard image asset is missing or belongs to another document; paste rejected.';
  }

  return null;
}

function activeWriterDocumentFingerprint(state: WriterV2StoreState): string | null {
  return state.currentDocumentFingerprint ?? state.documentMeta?.documentFingerprint ?? null;
}

function referencedAssetsBelongToDocument(
  state: WriterV2StoreState,
  elements: WriterElementV2[],
  documentFingerprint: string,
): boolean {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.imageAssetId) ids.add(element.imageAssetId);
    for (const id of element.assetIds ?? []) ids.add(id);
  }

  return [...ids].every((id) =>
    state.assetRecords.some((asset) =>
      asset.id === id
      && asset.documentFingerprint === documentFingerprint
      && asset.mimeType.startsWith('image/')
      && asset.dataUrl.startsWith('data:image/'),
    ),
  );
}

export function hasWriterClipboardElements(): boolean {
  return Boolean(
    clipboard
    && clipboard.elements.length > 0,
  );
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
    ...cloneClipboardElementSnapshot(
      element,
    ),
    id: createWriterClipboardElementId(),
    rect: {
      ...element.rect,
      x:
        element.rect.x
        + PASTE_OFFSET,
      y: Math.max(
        0,
        element.rect.y
        - PASTE_OFFSET,
      ),
    },
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint:
            element.callout.anchorPoint
              ? {
                  x:
                    element.callout
                      .anchorPoint.x
                    + PASTE_OFFSET,
                  y: Math.max(
                    0,
                    element.callout
                      .anchorPoint.y
                    - PASTE_OFFSET,
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

function cloneClipboardElementSnapshot(
  element: WriterElementV2,
): WriterElementV2 {
  return {
    ...element,
    rect: { ...element.rect },
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
                style: column.style
                  ? { ...column.style }
                  : undefined,
              }),
            ),
          rows:
            element.tableData.rows.map(
              (row) => ({
                ...row,
                cells: row.cells.map(
                  (cell) => ({
                    ...cell,
                    style: cell.style
                      ? { ...cell.style }
                      : undefined,
                  }),
                ),
              }),
            ),
          hasHeaderRow:
            element.tableData
              .hasHeaderRow,
          defaultCellStyle:
            element.tableData
              .defaultCellStyle
              ? {
                  ...element.tableData
                    .defaultCellStyle,
                }
              : undefined,
          headerCellStyle:
            element.tableData
              .headerCellStyle
              ? {
                  ...element.tableData
                    .headerCellStyle,
                }
              : undefined,
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint:
            element.callout.anchorPoint
              ? {
                  ...element.callout
                    .anchorPoint,
                }
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
