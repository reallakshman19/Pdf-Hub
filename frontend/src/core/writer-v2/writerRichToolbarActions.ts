import { useSessionStore } from '@/core/session/store';
import { ensureRichTextEditing } from './ensureRichTextEditing';
import {
  insertWriterQuickTemplate,
  type WriterQuickTemplateId,
} from './writerQuickTemplates';
import { useWriterV2Store } from './writerV2Store';

export type WriterRichToolbarActionId =
  | 'mainRichBox'
  | 'calloutSnippet'
  | 'stampSnippet'
  | 'reviewSnippet'
  | 'noteSnippet';

export interface WriterRichToolbarActionResult {
  changed: boolean;
  id?: string | null;
  message: string;
}

const TOOLBAR_TEMPLATE_BY_ACTION: Record<
  Exclude<WriterRichToolbarActionId, 'mainRichBox'>,
  WriterQuickTemplateId
> = {
  calloutSnippet: 'calloutCheckDimension',
  stampSnippet: 'stampReviewed',
  reviewSnippet: 'reviewEngineering',
  noteSnippet: 'noteGeneral',
};

export async function runWriterRichToolbarAction(
  actionId: WriterRichToolbarActionId,
): Promise<WriterRichToolbarActionResult> {
  const session = useSessionStore.getState();
  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (!sourceBytes || session.pageCount <= 0) {
    return {
      changed: false,
      id: null,
      message: 'Open a PDF before using Writer rich authoring tools.',
    };
  }

  useWriterV2Store.getState().setActiveWriterTool('select');

  if (actionId === 'mainRichBox') {
    const id = await ensureRichTextEditing({
      starterTemplate: 'authoringCard',
      includeStarterTable: false,
    });

    return {
      changed: Boolean(id),
      id,
      message: id
        ? 'Opened Writer rich authoring box.'
        : 'Unable to open Writer rich authoring box.',
    };
  }

  const templateId = TOOLBAR_TEMPLATE_BY_ACTION[actionId];
  const result = await insertWriterQuickTemplate(templateId);

  return {
    changed: result.changed,
    id: result.id ?? null,
    message: result.message,
  };
}
