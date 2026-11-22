import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
  WRITER_IMAGE_ADMISSION_LIMITS,
} from '@/core/admission/image/writerImageAdmission';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';

export async function createWriterImageAssetFromFile(
  file: File,
  documentFingerprint: string,
  now = new Date().toISOString(),
  existingAggregateAssetBytes = 0,
): Promise<WriterAssetRecordV2> {
  const admitted = await admitWriterImageFile(file, { existingAggregateAssetBytes });
  const original = encodeWriterImageDataUrl(admitted);
  const dataUrl = admitted.format === 'webp' ? await convertWebpToPng(original) : original;
  if (dataUrl.length > WRITER_IMAGE_ADMISSION_LIMITS.maxProjectedDataUrlBytes
    || dataUrl.length + existingAggregateAssetBytes > WRITER_IMAGE_ADMISSION_LIMITS.maxAggregateAssetBytes) {
    throw new Error('Writer image exceeds retained asset size limits.');
  }

  return {
    id: createWriterImageAssetId(),
    documentFingerprint,
    kind: 'image',
    mimeType: admitted.format === 'webp' ? 'image/png' : admitted.mimeType,
    dataUrl,
    width: admitted.width,
    height: admitted.height,
    createdAt: now,
    updatedAt: now,
  };
}

export function createWriterImageAssetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writer-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function writerAggregateAssetBytes(assets: readonly WriterAssetRecordV2[]): number {
  return assets.reduce((sum, asset) => sum + asset.dataUrl.length, 0);
}

function convertWebpToPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Unable to decode WEBP image.'));
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image conversion canvas unavailable.');
        context.drawImage(image, 0, 0);
        const png = canvas.toDataURL('image/png');
        if (!png.startsWith('data:image/png;base64,')) throw new Error('WEBP conversion failed.');
        resolve(png);
      } catch (error) { reject(error); }
    };
    image.src = dataUrl;
  });
}
