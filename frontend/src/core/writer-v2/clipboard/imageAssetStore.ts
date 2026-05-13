import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

export async function createWriterImageAssetFromFile(
  file: File,
  documentFingerprint: string,
  now = new Date().toISOString(),
): Promise<WriterAssetRecordV2> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Unsupported writer image asset type: ${file.type}`);
  }

  return {
    id: createWriterAssetId(),
    documentFingerprint,
    kind: 'image',
    mimeType: file.type,
    dataUrl: await fileToDataUrl(file),
    createdAt: now,
    updatedAt: now,
  };
}

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
    assets.push(await createWriterImageAssetFromFile(file, documentFingerprint));
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read image asset as data URL.'));
    };

    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image asset.'));
    reader.readAsDataURL(file);
  });
}
