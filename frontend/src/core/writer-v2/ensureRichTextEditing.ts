import type { WriterElementV2 } from './types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import { createRichTextBoxElement } from './writerElementFactory';
import {
  createWriterStarterEditorStateJson,
  type WriterStarterTemplateId,
} from './editor/writerEditorState';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';

const RICH_EDITABLE_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'richNote',
]);

export interface EnsureRichTextEditingOptions {
  starterTemplate?: WriterStarterTemplateId;
  includeStarterTable?: boolean;
}

export async function ensureRichTextEditing(
  options: EnsureRichTextEditingOptions = {},
): Promise<string | null> {
  const writer = useWriterV2Store.getState();
  const session = useSessionStore.getState();

  const selected = writer.elements.find((element) =>
    (writer.activeId === element.id || writer.selectedIds.includes(element.id)) &&
    RICH_EDITABLE_TYPES.has(element.type) &&
    !element.locked &&
    !element.hidden,
  );

  if (selected) {
    writer.beginEditingWriterElement(selected.id);
    return selected.id;
  }

  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (!sourceBytes || session.pageCount <= 0) {
    return null;
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  const pageIndex = Math.max(
    0,
    Math.min(session.viewState.currentPage - 1, pdf.getPageCount() - 1),
  );
  const page = pdf.getPage(pageIndex);
  const pageSize = page.getSize();

  const maxZIndex = writer.elements.reduce(
    (max, element) => Math.max(max, element.style.zIndex),
    0,
  );

  const element = createRichTextBoxElement({
    documentFingerprint:
      writer.currentDocumentFingerprint ??
      session.documentKey ??
      session.fileName ??
      'writer-v2-unsaved-document',
    pageIndex,
    rect: {
      x: 54,
      y: Math.max(54, pageSize.height - 360),
      width: Math.min(560, pageSize.width - 108),
      height: 290,
    },
    text: starterPlainText(options.starterTemplate ?? 'blank'),
    editorStateJson: createWriterStarterEditorStateJson(options.starterTemplate ?? 'blank'),
    zIndex: maxZIndex + 1,
  });

  writer.dispatchWriterCommand({
    type: 'ADD_WRITER_ELEMENT',
    element,
  });

  useWriterV2Store.getState().beginEditingWriterElement(element.id);

  if (options.includeStarterTable) {
    useRichEditorCommandQueue.getState().enqueue({
      type: 'insertTable',
      rows: 3,
      cols: 3,
    });
  }

  return element.id;
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
