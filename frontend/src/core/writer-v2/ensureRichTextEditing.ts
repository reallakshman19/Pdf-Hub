import type { WriterElementV2 } from './types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import { createRichTextBoxElement } from './writerElementFactory';
import {
  createWriterStarterEditorStateJson,
  type WriterStarterTemplateId,
} from './editor/writerEditorState';
import { useRichEditorCommandQueue, type PendingRichEditorCommand } from './richEditorCommandQueue';
import { captureRichEditorOwner, isRichEditorOwnerCurrent } from './editor/richEditorOwnership';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent } from './persistence/writerPersistenceOwner';
import { isDocumentMutationOwnerCurrent } from '@/core/session/mutationOwner';

const RICH_EDITABLE_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'richNote',
]);

export interface EnsureRichTextEditingOptions {
  starterTemplate?: WriterStarterTemplateId;
  includeStarterTable?: boolean;
  pendingCommands?: readonly PendingRichEditorCommand[];
}

export async function ensureRichTextEditing(
  options: EnsureRichTextEditingOptions = {},
): Promise<string | null> {
  const owner = captureWriterPersistenceOwner();
  const writer = owner.writer;
  const session = owner.document.session;
  const fingerprint = writer.currentDocumentFingerprint;
  const blank = writer.documentMeta?.mode === 'blankDocument' ? writer.documentMeta : null;
  if (!fingerprint || (blank ? !!session.documentKey : fingerprint !== session.documentKey)) return null;
  const pending: PendingRichEditorCommand[] = [...(options.pendingCommands ?? [])];
  if (options.includeStarterTable) pending.push({ type: 'insertTable', rows: 3, cols: 3 });

  const begin = (element: WriterElementV2): string | null => {
    const current = useWriterV2Store.getState();
    const target = current.elements.find(item => item.id === element.id);
    if (!isDocumentMutationOwnerCurrent(owner.document) || !target || target.documentFingerprint !== fingerprint
      || target.createdAt !== element.createdAt || target.editorStateJson !== element.editorStateJson
      || target.plainText !== element.plainText || target.locked || target.hidden) return null;
    const editorOwner = captureRichEditorOwner(target);
    if (!isRichEditorOwnerCurrent(editorOwner)) return null;
    current.beginEditingWriterElement(target.id);
    for (const command of pending) {
      if (!useRichEditorCommandQueue.getState().enqueue(command, editorOwner)) return null;
    }
    return target.id;
  };

  const selected = writer.elements.find(element =>
    (writer.activeId === element.id || writer.selectedIds.includes(element.id))
    && element.documentFingerprint === fingerprint && RICH_EDITABLE_TYPES.has(element.type)
    && !element.locked && !element.hidden);
  if (selected) return begin(selected);

  const sourceBytes = session.workingBytes ?? session.originalBytes;
  let pageIndex: number;
  let pageSize: { width: number; height: number };
  if (blank) {
    pageIndex = Math.max(0, Math.min(session.viewState.currentPage - 1, blank.pageCount - 1));
    pageSize = blank.pageSetup;
  } else {
    if (!sourceBytes || session.pageCount <= 0) return null;
    const { PDFDocument } = await pdfLib();
    const pdf = await PDFDocument.load(sourceBytes);
    if (pdf.getPageCount() <= 0) return null;
    pageIndex = Math.max(0, Math.min(session.viewState.currentPage - 1, pdf.getPageCount() - 1));
    pageSize = pdf.getPage(pageIndex).getSize();
  }
  // Selection or page navigation during admission is a new user intent.
  const stillCurrent = () => {
    const current = useWriterV2Store.getState();
    return isWriterPersistenceOwnerCurrent(owner)
      && current.activeId === writer.activeId && current.selectedIds === writer.selectedIds
      && current.editingId === writer.editingId
      && useSessionStore.getState().viewState.currentPage === session.viewState.currentPage;
  };
  if (!stillCurrent()) return null;
  const margin = Math.min(54, pageSize.width / 8, pageSize.height / 8);
  const width = Math.min(560, pageSize.width - 2 * margin);
  const height = Math.min(290, pageSize.height - 2 * margin);
  if (!(width > 0 && height > 0)) return null;
  const element = createRichTextBoxElement({
    documentFingerprint: fingerprint, pageIndex,
    rect: { x: margin, y: Math.max(margin, pageSize.height - margin - height), width, height },
    text: starterPlainText(options.starterTemplate ?? 'blank'),
    editorStateJson: createWriterStarterEditorStateJson(options.starterTemplate ?? 'blank'),
    zIndex: writer.elements.reduce((max, item) => Math.max(max, item.style.zIndex), 0) + 1,
  });
  const result = await useWriterV2Store.getState().dispatchWriterCommandDurableLatest(() =>
    stillCurrent() ? { type: 'ADD_WRITER_ELEMENT', element } : null);
  if (!result.changed || useWriterV2Store.getState().activeId !== element.id) return null;
  // The new element belongs to the original session even if the journal
  // completion arrives after a document switch. Never select a foreign ID.
  return begin(element);
}

function starterPlainText(templateId: WriterStarterTemplateId): string {
  switch (templateId) {
    case 'authoringCard':
      return 'Document Heading\nWrite your content here.\nAction / comment:';

    case 'reviewComment':
      return 'Review Comment\nObservation:\nRequired action:\nStatus: Open';

    case 'engineeringNote':
      return 'Engineering Note\nReference:\nFinding:\nRecommendation:';

    case 'blank':
    default:
      return '';
  }
}
