import { v4 as uuidv4 } from 'uuid';

import type { PdfAnnotation } from '../annotations/types';
import type { PdfCommand } from '../commands/types';
import { clonePageGraph } from '../pages/pageGraph';
import { useSessionStore } from '../session/store';
import type { WriterElementV2 } from '../writer-v2/types';
import { useHistoryStore } from './store';
import type { WriterHistoryState } from './types';

export interface StateHistorySnapshot {
  annotations: PdfAnnotation[];
  writer: WriterHistoryState;
}

export interface RecordStateTransactionInput {
  command: PdfCommand;
  label: string;
  before: StateHistorySnapshot;
  after: StateHistorySnapshot;
}

export function writerHistoryState(input: {
  elements: WriterElementV2[];
  selectedIds: string[];
  activeId: string | null;
  documentMeta?: { mode: 'pdfOverlay' | 'blankDocument' } | null;
}): WriterHistoryState {
  return {
    ...(input.documentMeta?.mode ? { documentMode: input.documentMeta.mode } : {}),
    elements: cloneWriterElements(input.elements),
    selectedIds: [...input.selectedIds],
    activeId: input.activeId,
  };
}

export function cloneAnnotations(
  annotations: PdfAnnotation[],
): PdfAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    rect: { ...annotation.rect },
    data: { ...annotation.data },
  }));
}

export function recordStateTransaction(
  input: RecordStateTransactionInput,
): boolean {
  const session = useSessionStore.getState();

  const hasDurableRevision = Boolean(
    session.revisionStoreId && session.activeRevisionId,
  );

  if (
    !session.documentKey
    || (!hasDurableRevision && !session.workingBytes)
  ) {
    return false;
  }

  if (input.command.documentKey !== session.documentKey) {
    return false;
  }

  const pdfBacking = hasDurableRevision
    ? {
        revision: {
          storeId: session.revisionStoreId as string,
          revisionId: session.activeRevisionId as string,
        },
        activeRevisionId: session.activeRevisionId,
      }
    : {
        bytes: session.workingBytes as Uint8Array,
        activeRevisionId: session.activeRevisionId,
      };

  const baseState = {
    ...pdfBacking,
    pageCount: session.pageCount,
    pageGraph: session.pageGraph ? clonePageGraph(session.pageGraph) : null,
    documentKey: session.documentKey,
    selectedPageIds: [...session.selectedPageIds],
    selectedPages: [...session.selectedPages],
    currentPageId: session.viewState.currentPageId,
    currentPage: session.viewState.currentPage,
  };

  useHistoryStore.getState().push({
    id: uuidv4(),
    command: input.command,
    label: input.label,
    timestamp: Date.now(),
    ...(input.command.groupId ? { groupId: input.command.groupId } : {}),
    before: {
      ...baseState,
      annotations: cloneAnnotations(input.before.annotations),
      writer: writerHistoryState(input.before.writer),
    },
    after: {
      ...baseState,
      annotations: cloneAnnotations(input.after.annotations),
      writer: writerHistoryState(input.after.writer),
    },
  });

  return true;
}

function cloneWriterElements(
  elements: WriterElementV2[],
): WriterElementV2[] {
  return elements.map((element) => ({
    ...element,
    rect: { ...element.rect },
    style: { ...element.style },
  }));
}
