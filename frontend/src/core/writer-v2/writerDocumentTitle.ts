import type { WriterDocumentMetaV2 } from './types';

export function normalizeWriterDocumentTitle(title: string | undefined): string {
  const trimmed = title?.trim() ?? '';

  if (!trimmed) {
    return 'Untitled document';
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, 160);
}

export function updateWriterDocumentTitle(
  meta: WriterDocumentMetaV2,
  title: string,
  now = new Date().toISOString(),
): WriterDocumentMetaV2 {
  return {
    ...meta,
    title: normalizeWriterDocumentTitle(title),
    updatedAt: now,
  };
}
