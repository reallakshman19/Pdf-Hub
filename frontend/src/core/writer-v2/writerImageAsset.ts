import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
} from '@/core/admission/image/writerImageAdmission';
import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';

export async function createWriterImageAssetFromFile(
  file: File,
  documentFingerprint: string,
  now = new Date().toISOString(),
): Promise<WriterAssetRecordV2> {
  const admitted = await admitWriterImageFile(file);

  return {
    id: createWriterImageAssetId(),
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

export function createWriterImageAssetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writer-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
