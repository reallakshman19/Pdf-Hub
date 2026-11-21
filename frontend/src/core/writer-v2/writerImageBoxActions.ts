import { createWriterImageAssetFromFile, writerAggregateAssetBytes } from './writerImageAsset';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent } from './persistence/writerPersistenceOwner';
import { createImageBoxElement } from './writerElementFactory';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  dispatchDurableWriterHelperLatest,
} from './durableWriterHelperDispatch';

export interface WriterImageReplaceResult {
  changed: boolean;
  message: string;
}

export async function replaceActiveImageBoxAsset(
  file: File,
): Promise<WriterImageReplaceResult> {
  const store = useWriterV2Store.getState();
  const activeId = store.activeId ?? store.selectedIds.at(-1);

  if (!activeId) {
    return {
      changed: false,
      message: 'No active Writer image selected.',
    };
  }

  const element = store.elements.find((item) => item.id === activeId);

  if (!element || element.type !== 'imageBox' || element.locked || element.hidden) {
    return {
      changed: false,
      message: 'No editable Writer image selected.',
    };
  }

  const owner = captureWriterPersistenceOwner();
  if (!store.currentDocumentFingerprint || element.documentFingerprint !== store.currentDocumentFingerprint) {
    return { changed: false, message: 'Writer image has no current document owner.' };
  }
  try {
    const asset = await createWriterImageAssetFromFile(file, element.documentFingerprint,
      new Date().toISOString(), writerAggregateAssetBytes(store.assetRecords));
    if (!isWriterPersistenceOwnerCurrent(owner)) return staleImage();
    const result = await useWriterV2Store.getState().dispatchWriterCommandDurableLatest(state => {
      if (!isWriterPersistenceOwnerCurrent(owner)) return null;
      const target = state.elements.find(item => item.id === element.id);
      if (!target || target.type !== 'imageBox' || target.hidden || target.locked) return null;
      return { type: 'UPDATE_WRITER_ELEMENT', id: target.id, patch: {
        plainText: file.name, imageAssetId: asset.id, assetIds: [asset.id],
      } };
    }, { stagedAssets: [asset] });
    return { changed: result.changed, message: result.changed ? 'Replaced Writer image asset.' : result.reason };
  } catch (error) {
    return { changed: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** The blank-document toolbar uses the same owner-qualified staged asset mutation. */
export async function insertBlankWriterImage(file: File): Promise<WriterImageReplaceResult> {
  const owner = captureWriterPersistenceOwner();
  const store = owner.writer;
  const meta = store.documentMeta;
  if (!meta || meta.mode !== 'blankDocument' || meta.documentFingerprint !== store.currentDocumentFingerprint) {
    return { changed: false, message: 'Open or create a blank Writer document before inserting images.' };
  }
  try {
    const asset = await createWriterImageAssetFromFile(file, meta.documentFingerprint,
      new Date().toISOString(), writerAggregateAssetBytes(store.assetRecords));
    if (!isWriterPersistenceOwnerCurrent(owner)) return staleImage();
    const result = await useWriterV2Store.getState().dispatchWriterCommandDurableLatest(state => {
      if (!isWriterPersistenceOwnerCurrent(owner)) return null;
      const setup = meta.pageSetup;
      const maxWidth = setup.width - setup.marginLeft - setup.marginRight;
      const maxHeight = setup.height - setup.marginTop - setup.marginBottom;
      if (maxWidth <= 0 || maxHeight <= 0 || !asset.width || !asset.height) return null;
      const scale = Math.min(320 / asset.width, 220 / asset.height, maxWidth / asset.width, maxHeight / asset.height);
      const width = asset.width * scale, height = asset.height * scale;
      const zIndex = state.elements.reduce((max, element) => Math.max(max, element.style.zIndex), 0) + 1;
      return { type: 'ADD_WRITER_ELEMENT', element: createImageBoxElement({
        documentFingerprint: meta.documentFingerprint, pageIndex: 0,
        imageAssetId: asset.id, assetIds: [asset.id],
        imageWidth: asset.width, imageHeight: asset.height,
        rect: { x: setup.marginLeft, y: setup.height - setup.marginTop - height, width, height },
        text: file.name || 'Image', zIndex,
      }) };
    }, { stagedAssets: [asset] });
    return { changed: result.changed, message: result.changed ? 'Image inserted into blank Writer document.' : result.reason };
  } catch (error) {
    return { changed: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function staleImage(): WriterImageReplaceResult {
  return { changed: false, message: 'Writer document changed before image admission completed.' };
}

export async function clearActiveImageBoxAsset(): Promise<WriterImageReplaceResult> {
  const store = useWriterV2Store.getState();
  const activeId =
    store.activeId
    ?? store.selectedIds.at(-1);

  if (!activeId) {
    return {
      changed: false,
      message:
        'No active Writer image selected.',
    };
  }

  const current = store.elements.find(
    (item) => item.id === activeId,
  );

  if (
    !current
    || current.type !== 'imageBox'
    || current.locked
    || current.hidden
  ) {
    return {
      changed: false,
      message:
        'No editable Writer image selected.',
    };
  }

  const result =
    await dispatchDurableWriterHelperLatest(
      'Writer image clear',
      (state) => {
        const element = state.elements.find(
          (item) => item.id === activeId,
        );

        if (
          !element
          || element.type !== 'imageBox'
          || element.locked
          || element.hidden
        ) {
          return null;
        }

        return {
          type: 'UPDATE_WRITER_ELEMENT',
          id: element.id,
          patch: {
            plainText: 'Image',
            imageAssetId: undefined,
            assetIds: [],
          },
        };
      },
    );

  return {
    changed: result.changed,
    message: result.changed
      ? 'Cleared Writer image asset.'
      : result.reason,
  };
}

export function getActiveImageBox(): WriterElementV2 | null {
  const store = useWriterV2Store.getState();
  const activeId = store.activeId ?? store.selectedIds.at(-1);

  if (!activeId) return null;

  const element = store.elements.find((item) => item.id === activeId);

  if (!element || element.type !== 'imageBox' || element.locked || element.hidden) {
    return null;
  }

  return element;
}
