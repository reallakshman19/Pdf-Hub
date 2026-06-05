import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useSessionStore } from '@/core/session/store';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import { useWriterV2Store } from './writerV2Store';
import { runWriterRichToolbarAction } from './writerRichToolbarActions';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

describe('writerRichToolbarActions', () => {
  beforeEach(async () => {
    useRichEditorCommandQueue.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('opens main rich authoring box', async () => {
    const result = await runWriterRichToolbarAction('mainRichBox');
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].plainText).toContain('Document Heading');
    expect(state.editingId).toBe(state.elements[0].id);
    expect(state.activeWriterTool).toBe('select');
  });

  it('inserts stamp snippet into rich box', async () => {
    const result = await runWriterRichToolbarAction('stampSnippet');
    const state = useWriterV2Store.getState();
    const pending = useRichEditorCommandQueue.getState().pending;

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(pending).toEqual([
      {
        type: 'insertTemplateSnippet',
        blocks: [
          expect.objectContaining({
            kind: 'heading',
            text: 'REVIEWED',
          }),
        ],
      },
    ]);
  });

  it('inserts review snippet and applies review metadata to rich box', async () => {
    const result = await runWriterRichToolbarAction('reviewSnippet');
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].review?.status).toBe('open');
    expect(state.elements[0].review?.priority).toBe('medium');
    expect(state.elements[0].review?.category).toBe('engineering');
  });

  it('inserts note snippet into rich box', async () => {
    const result = await runWriterRichToolbarAction('noteSnippet');
    const pending = useRichEditorCommandQueue.getState().pending;

    expect(result.changed).toBe(true);
    expect(pending[0]).toMatchObject({
      type: 'insertTemplateSnippet',
    });
    expect(JSON.stringify(pending[0])).toContain('Note:');
  });

  it('rejects action when no PDF is open', async () => {
    useSessionStore.getState().clearDocument();

    const result = await runWriterRichToolbarAction('mainRichBox');

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/open a pdf/i);
    expect(useWriterV2Store.getState().elements).toHaveLength(0);
  });
});
