import { downloadBlob } from '@/core/document/download';

export function downloadWriterBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): void {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: mimeType,
  });

  downloadBlob(blob, fileName);
}

export function safeDownloadBaseName(fileName: string | null | undefined): string {
  const raw = fileName?.trim() || 'document';

  return raw
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'document';
}