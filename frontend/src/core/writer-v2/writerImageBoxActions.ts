import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';

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

  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    return {
      changed: false,
      message: 'Only PNG, JPG, and WEBP images are supported.',
    };
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const dataUrl = file.type.toLowerCase() === 'image/webp'
    ? await renderImageDataUrlToPng(originalDataUrl)
    : originalDataUrl;
  const mimeType = file.type.toLowerCase() === 'image/webp'
    ? 'image/png'
    : file.type;
  const size = await measureImageDataUrl(dataUrl);
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
    width: size.width,
    height: size.height,
    createdAt: now,
    updatedAt: now,
  };

  store.addWriterAssets([asset]);

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: element.id,
    patch: {
      plainText: file.name,
      imageAssetId: assetId,
      assetIds: [assetId],
    },
  });

  return {
    changed: result.changed,
    message: result.changed
      ? 'Replaced Writer image asset.'
      : result.reason,
  };
}

export function clearActiveImageBoxAsset(): WriterImageReplaceResult {
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

  const result = store.dispatchWriterCommand({
    type: 'UPDATE_WRITER_ELEMENT',
    id: element.id,
    patch: {
      plainText: 'Image',
      imageAssetId: undefined,
      assetIds: [],
    },
  });

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Image import did not produce a data URL.'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
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
