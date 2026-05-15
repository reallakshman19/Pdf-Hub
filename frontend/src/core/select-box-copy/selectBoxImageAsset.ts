import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';

export function createSelectBoxImageAssetFromDataUrl(input: {
  dataUrl: string;
  documentFingerprint: string;
  now?: string;
}): WriterAssetRecordV2 {
  const mimeType = mimeTypeFromDataUrl(input.dataUrl);
  const now = input.now ?? new Date().toISOString();

  return {
    id: createAssetId(),
    documentFingerprint: input.documentFingerprint,
    kind: 'image',
    mimeType,
    dataUrl: input.dataUrl,
    createdAt: now,
    updatedAt: now,
  };
}

function mimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);

  if (!match) {
    throw new Error('Invalid Select Box Copy image data URL.');
  }

  if (!match[1].startsWith('image/')) {
    throw new Error(`Unsupported Select Box Copy image mime type: ${match[1]}`);
  }

  return match[1];
}

function createAssetId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `select-box-image-${globalThis.crypto.randomUUID()}`;
  }

  return `select-box-image-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}