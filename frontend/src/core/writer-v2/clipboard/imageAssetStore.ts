import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
} from '@/core/admission/image/writerImageAdmission';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

export async function createWriterImageAssetFromFile(
  file: File,
  documentFingerprint: string,
  now = new Date().toISOString(),
): Promise<WriterAssetRecordV2> {
  const admitted = await admitWriterImageFile(file);

  return {
    id: createWriterAssetId(),
    documentFingerprint,
    kind: 'image',
    mimeType: admitted.mimeType,
    dataUrl: encodeWriterImageDataUrl(admitted),
    width: admitted.width,
    height: admitted.height,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Pasted clipboard items can include several candidate images (or none, or
 * ones a browser mislabels). A file failing the shared admission boundary
 * is skipped rather than failing the whole paste -- there is no per-item
 * error channel back to the user for a multi-item paste.
 */
export async function extractImageAssetsFromClipboardData(
  clipboardData: Pick<DataTransfer, 'files' | 'items'>,
  documentFingerprint: string,
): Promise<WriterAssetRecordV2[]> {
  const files = new Map<string, File>();

  for (const file of Array.from(clipboardData.files ?? [])) {
    if (file.type.startsWith('image/')) {
      files.set(fileKey(file), file);
    }
  }

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        files.set(fileKey(file), file);
      }
    }
  }

  const assets: WriterAssetRecordV2[] = [];

  for (const file of files.values()) {
    try {
      assets.push(await createWriterImageAssetFromFile(file, documentFingerprint));
    } catch {
      // Not a real, admissible image (bad signature, unsupported format,
      // over a size/dimension bound) -- skip it, don't fail the paste.
    }
  }

  return assets;
}

function fileKey(file: File): string {
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
}

function createWriterAssetId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `writer-asset-${globalThis.crypto.randomUUID()}`;
  }

  return `writer-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

