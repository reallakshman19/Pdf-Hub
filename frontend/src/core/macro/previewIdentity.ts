import { getDocumentSessionGeneration } from '@/core/session/store';
import type { DocumentSession } from '@/core/session/types';

/**
 * Exact source snapshot for a builder Test Run or queued execution.
 * Byte-array *reference* is intentional: committed working copies are
 * immutable replacements, and a same-hash reopened document is not the same
 * editing session (sessionGeneration distinguishes reopen).
 */
export interface MacroPreviewIdentity {
  recipeSignature: string;
  sessionGeneration: number;
  documentKey: string | null;
  activeRevisionId: string | null;
  workingBytes: Uint8Array | null;
  fileName: string | null;
  pageCount: number;
  selectedPagesKey: string;
  selectedPageIdsKey: string;
  currentPage: number;
  currentPageId: string | null;
}

export function snapshotMacroPreview(
  recipeSignature: string,
  session: DocumentSession,
): MacroPreviewIdentity {
  return {
    recipeSignature,
    sessionGeneration: getDocumentSessionGeneration(),
    documentKey: session.documentKey,
    activeRevisionId: session.activeRevisionId,
    workingBytes: session.workingBytes,
    fileName: session.fileName,
    pageCount: session.pageCount,
    selectedPagesKey: JSON.stringify(session.selectedPages),
    selectedPageIdsKey: JSON.stringify(session.selectedPageIds),
    currentPage: session.viewState.currentPage,
    currentPageId: session.viewState.currentPageId,
  };
}

export function sameMacroPreview(
  expected: MacroPreviewIdentity | null,
  actual: MacroPreviewIdentity,
): boolean {
  if (!expected) return false;
  return expected.recipeSignature === actual.recipeSignature
    && expected.sessionGeneration === actual.sessionGeneration
    && expected.documentKey === actual.documentKey
    && expected.activeRevisionId === actual.activeRevisionId
    && expected.workingBytes === actual.workingBytes
    && expected.fileName === actual.fileName
    && expected.pageCount === actual.pageCount
    && expected.selectedPagesKey === actual.selectedPagesKey
    && expected.selectedPageIdsKey === actual.selectedPageIdsKey
    && expected.currentPage === actual.currentPage
    && expected.currentPageId === actual.currentPageId;
}
