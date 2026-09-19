import type { DocumentSource } from './types';

const sources = new Map<string, DocumentSource>();

export class DocumentSourceRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentSourceRegistryError';
  }
}

export function registerDocumentSource(
  source: DocumentSource,
): void {
  const existing = sources.get(source.id);
  if (existing && existing !== source) {
    throw new DocumentSourceRegistryError(
      `A different DocumentSource is already registered for id ${source.id}.`,
    );
  }
  sources.set(source.id, source);
}

export function resolveDocumentSource(
  sourceId: string,
): DocumentSource | null {
  return sources.get(sourceId) ?? null;
}

export function releaseDocumentSource(
  sourceId: string | null | undefined,
): void {
  if (!sourceId) return;
  sources.delete(sourceId);
}

/** Test-only reset for the process-local runtime registry. */
export function clearDocumentSourceRegistryForTests(): void {
  sources.clear();
}
