import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
} from '@/core/admission/image/writerImageAdmission';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
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

  let admitted;
  try {
    admitted = await admitWriterImageFile(file, {
      existingAggregateAssetBytes: aggregateAssetBytes(store.assetRecords),
    });
  } catch (admissionError) {
    return {
      changed: false,
      message: admissionError instanceof Error ? admissionError.message : String(admissionError),
    };
  }

  const originalDataUrl = encodeWriterImageDataUrl(admitted);
  const dataUrl = admitted.format === 'webp'
    ? await renderImageDataUrlToPng(originalDataUrl)
    : originalDataUrl;
  const mimeType = admitted.format === 'webp' ? 'image/png' : admitted.mimeType;
  const now = new Date().toISOString();
  const assetId = createWriterAssetId();

  const asset: WriterAssetRecordV2 = {
    id: assetId,
    documentFingerprint:
      store.currentDocumentFingerprint ??
      element.documentFingerprint,
    kind: 'image',
    mimeType,
    dataUrl,
    width: admitted.width,
    height: admitted.height,
    createdAt: now,
    updatedAt: now,
  };

  const previousDirty = store.dirty;
  store.addWriterAssets([asset]);

  try {
    const result =
      await store.dispatchWriterCommandDurable({
        type: 'UPDATE_WRITER_ELEMENT',
        id: element.id,
        patch: {
          plainText: file.name,
          imageAssetId: assetId,
          assetIds: [assetId],
        },
      });

    if (!result.changed) {
      useWriterV2Store.getState().removeWriterAsset(
        assetId,
      );
      useWriterV2Store.setState({
        dirty: previousDirty,
      });
    }

    return {
      changed: result.changed,
      message: result.changed
        ? 'Replaced Writer image asset.'
        : result.reason,
    };
  } catch (error) {
    useWriterV2Store.getState().removeWriterAsset(
      assetId,
    );
    useWriterV2Store.setState({
      dirty: previousDirty,
    });

    return {
      changed: false,
      message:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
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

function aggregateAssetBytes(assets: readonly WriterAssetRecordV2[]): number {
  return assets.reduce((sum, asset) => sum + (asset.dataUrl?.length ?? 0), 0);
}

function measureImageDataUrl(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      });
    };

    image.onerror = () => reject(new Error('Failed to measure imported image.'));
    image.src = dataUrl;
  });
}

async function renderImageDataUrlToPng(dataUrl: string): Promise<string> {
  const imageSize = await measureImageDataUrl(dataUrl);
  const image = await loadImageDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not available for WEBP image conversion.');
  }

  context.drawImage(image, 0, 0, imageSize.width, imageSize.height);
  return canvas.toDataURL('image/png');
}

function loadImageDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load imported image.'));
    image.src = dataUrl;
  });
}

function createWriterAssetId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `writer-asset-${globalThis.crypto.randomUUID()}`;
  }

  return `writer-asset-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
