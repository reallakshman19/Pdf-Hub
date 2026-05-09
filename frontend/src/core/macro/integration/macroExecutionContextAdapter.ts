import type {
  MacroExecutionContext,
} from '../types';

export interface MacroDocumentRuntimeSnapshot {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages?: number[];
  currentPage?: number;
  fileName?: string;
  donorFiles?: Record<string, Uint8Array>;
}

export interface MacroExecutionContextAdapterOptions {
  abortOnError?: boolean;
}

export function createMacroExecutionContextFromSnapshot(
  snapshot: MacroDocumentRuntimeSnapshot,
  options: MacroExecutionContextAdapterOptions = {},
): MacroExecutionContext {
  validateRuntimeSnapshot(snapshot);

  return {
    workingBytes: new Uint8Array(snapshot.workingBytes),
    pageCount: snapshot.pageCount,
    selectedPages: sanitizePages(snapshot.selectedPages ?? [], snapshot.pageCount),
    currentPage: sanitizeCurrentPage(snapshot.currentPage ?? 1, snapshot.pageCount),
    fileName: snapshot.fileName?.trim() || 'document.pdf',
    donorFiles: cloneDonorFiles(snapshot.donorFiles),
    options: {
      abortOnError: options.abortOnError ?? true,
    },
  };
}

export function validateRuntimeSnapshot(
  snapshot: MacroDocumentRuntimeSnapshot,
): void {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Macro runtime snapshot is required.');
  }

  if (!(snapshot.workingBytes instanceof Uint8Array)) {
    throw new Error('Macro runtime snapshot requires workingBytes as Uint8Array.');
  }

  if (!Number.isInteger(snapshot.pageCount) || snapshot.pageCount < 1) {
    throw new Error('Macro runtime snapshot requires pageCount >= 1.');
  }
}

export function applyMacroBytesToSnapshot(
  snapshot: MacroDocumentRuntimeSnapshot,
  bytes: Uint8Array,
): MacroDocumentRuntimeSnapshot {
  return {
    ...snapshot,
    workingBytes: new Uint8Array(bytes),
  };
}

function sanitizePages(
  pages: number[],
  pageCount: number,
): number[] {
  return Array.from(
    new Set(
      pages
        .filter((page) => Number.isInteger(page))
        .filter((page) => page >= 1 && page <= pageCount),
    ),
  );
}

function sanitizeCurrentPage(
  currentPage: number,
  pageCount: number,
): number {
  if (!Number.isInteger(currentPage)) return 1;
  return Math.max(1, Math.min(pageCount, currentPage));
}

function cloneDonorFiles(
  donorFiles?: Record<string, Uint8Array>,
): Record<string, Uint8Array> | undefined {
  if (!donorFiles) return undefined;

  return Object.fromEntries(
    Object.entries(donorFiles).map(([key, bytes]) => [
      key,
      new Uint8Array(bytes),
    ]),
  );
}
