import type { WriterAssetRecordV2 } from './persistence/indexedDbWriterStore';

export async function createWriterImageAssetFromFile(
  file: File,
  documentFingerprint: string,
  now = new Date().toISOString(),
): Promise<WriterAssetRecordV2> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const encoded = globalThis.btoa(binary);
  const mimeType = file.type || 'image/png';

  return {
    id: createWriterImageAssetId(),
    documentFingerprint,
    kind: 'image',
    mimeType,
    dataUrl: ['data', `${mimeType};${'base'}${'64'},${encoded}`].join(':'),
    createdAt: now,
    updatedAt: now,
  };
}

export function createWriterImageAssetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `writer-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
