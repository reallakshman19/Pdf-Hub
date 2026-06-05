import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import {
  getWriterQuickTemplate,
  getWriterQuickTemplatesByGroup,
  insertWriterQuickTemplate,
  WRITER_QUICK_TEMPLATES,
} from './writerQuickTemplates';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

describe('writerQuickTemplates', () => {
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

  it('has unique template ids', () => {
    const ids = WRITER_QUICK_TEMPLATES.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groups stamp templates', () => {
    const stamps = getWriterQuickTemplatesByGroup('stamp');

    expect(stamps.length).toBeGreaterThan(0);
    expect(stamps.every((template) => template.group === 'stamp')).toBe(true);
  });

  it('retrieves a known template', () => {
    expect(getWriterQuickTemplate('stampReviewed').label).toBe('REVIEWED');
  });

  it('inserts a reviewed stamp snippet into a rich text box', async () => {
    const result = await insertWriterQuickTemplate('stampReviewed');
    const state = useWriterV2Store.getState();
    const pending = useRichEditorCommandQueue.getState().pending;

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].pageIndex).toBe(0);
    expect(state.editingId).toBe(state.elements[0].id);
    expect(pending).toEqual([
      {
        type: 'insertTemplateSnippet',
        blocks: [
          expect.objectContaining({
            kind: 'heading',
            level: 2,
            text: 'REVIEWED',
          }),
        ],
      },
    ]);
  });

  it('inserts a review snippet and applies metadata to the rich text box', async () => {
    const result = await insertWriterQuickTemplate('reviewEngineering');
    const state = useWriterV2Store.getState();
    const pending = useRichEditorCommandQueue.getState().pending;

    expect(result.changed).toBe(true);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].review?.status).toBe('open');
    expect(state.elements[0].review?.priority).toBe('medium');
    expect(state.elements[0].review?.category).toBe('engineering');
    expect(pending[0]).toMatchObject({
      type: 'insertTemplateSnippet',
    });
  });

  it('rejects insert when no PDF is open', async () => {
    useSessionStore.getState().clearDocument();

    const result = await insertWriterQuickTemplate('stampReviewed');

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/open a pdf/i);
  });
});
