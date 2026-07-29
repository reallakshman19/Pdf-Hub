import { useSessionStore } from '@/core/session/store';
import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
} from '@/core/admission/image/writerImageAdmission';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';
import { ensureRichTextEditing } from './ensureRichTextEditing';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import { useWriterV2Store } from './writerV2Store';

export interface WriterRichInsertResult {
  changed: boolean;
  message: string;
  elementId?: string | null;
  assetId?: string;
}

export async function insertRichTableIntoActiveBox(
  rows = 3,
  cols = 3,
): Promise<WriterRichInsertResult> {
  const sourceBytes = currentSourceBytes();

  if (!sourceBytes) {
    return {
      changed: false,
      message: 'Open a PDF before inserting a Writer table.',
    };
  }

  const safeRows = clampInt(rows, 1, 50);
  const safeCols = clampInt(cols, 1, 20);

  useRichEditorCommandQueue.getState().enqueue({
    type: 'insertTable',
    rows: safeRows,
    cols: safeCols,
  });

  const elementId = await ensureRichTextEditing();

  if (!elementId) {
    useRichEditorCommandQueue.getState().clear();
    return {
      changed: false,
      message: 'Unable to open a Writer rich box for table insertion.',
    };
  }

  return {
    changed: true,
    elementId,
    message: `Inserted ${safeRows}x${safeCols} table into Writer rich box.`,
  };
}

export async function insertImageFileIntoRichBox(
  file: File,
): Promise<WriterRichInsertResult> {
  const session = useSessionStore.getState();
  const writer = useWriterV2Store.getState();
  const sourceBytes = currentSourceBytes();

  if (!sourceBytes) {
    return {
      changed: false,
      message: 'Open a PDF before inserting an image into Writer.',
    };
  }

  let admitted;
  try {
    admitted = await admitWriterImageFile(file, {
      existingAggregateAssetBytes: aggregateAssetBytes(writer.assetRecords),
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
  const imageSize = { width: admitted.width, height: admitted.height };
  const documentFingerprint =
    writer.currentDocumentFingerprint ??
    session.documentKey ??
    session.fileName ??
    'writer-v2-unsaved-document';
  const assetId = createWriterAssetId();
  const now = new Date().toISOString();

  const asset: WriterAssetRecordV2 = {
    id: assetId,
    documentFingerprint,
    kind: 'image',
    mimeType,
    dataUrl,
    width: imageSize.width,
    height: imageSize.height,
    createdAt: now,
    updatedAt: now,
  };

  useWriterV2Store.getState().addWriterAssets([asset]);

  useRichEditorCommandQueue.getState().enqueue({
    type: 'insertImage',
    src: dataUrl,
    altText: file.name,
    width: Math.min(360, Math.max(80, imageSize.width)),
    height: Math.min(240, Math.max(60, imageSize.height)),
    caption: file.name,
  });

  const elementId = await ensureRichTextEditing();

  if (!elementId) {
    useRichEditorCommandQueue.getState().clear();
    useWriterV2Store.getState().removeWriterAsset(assetId);
    return {
      changed: false,
      message: 'Unable to open a Writer rich box for image insertion.',
    };
  }

  return {
    changed: true,
    elementId,
    assetId,
    message: 'Inserted image into Writer rich box.',
  };
}

function currentSourceBytes(): Uint8Array | null {
  const session = useSessionStore.getState();
  return session.workingBytes ?? session.originalBytes ?? null;
}

function aggregateAssetBytes(assets: readonly WriterAssetRecordV2[]): number {
  return assets.reduce((sum, asset) => sum + (asset.dataUrl?.length ?? 0), 0);
}

function renderImageDataUrlToPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width || 1;
      canvas.height = image.naturalHeight || image.height || 1;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Unable to create image conversion canvas.'));
        return;
      }

      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => reject(new Error('Failed to convert WEBP image.'));
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

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
