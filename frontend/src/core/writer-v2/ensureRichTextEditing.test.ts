import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from './types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import { ensureRichTextEditing } from './ensureRichTextEditing';

import { useRichEditorCommandQueue } from './richEditorCommandQueue';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: 'Existing box',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('ensureRichTextEditing', () => {
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

  it('opens selected rich text object for editing', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    const id = await ensureRichTextEditing();

    expect(id).toBe('writer-1');
    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
  });

  it('creates a rich text object when none is selected', async () => {
    const id = await ensureRichTextEditing();
    const state = useWriterV2Store.getState();

    expect(id).toBeTruthy();
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.editingId).toBe(id);
  });

  it('does not use locked selected rich text object', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('locked-writer', {
          locked: true,
        }),
      ],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'locked-writer',
    });

    const id = await ensureRichTextEditing();

    expect(id).not.toBe('locked-writer');
    expect(useWriterV2Store.getState().elements).toHaveLength(2);
  });

  it('creates authoring starter box and queues starter table when requested', async () => {
    const id = await ensureRichTextEditing({
      starterTemplate: 'authoringCard',
      includeStarterTable: true,
    });
    const state = useWriterV2Store.getState();

    expect(id).toBeTruthy();
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].plainText).toContain('Document Heading');
    expect(state.elements[0].editorStateJson).toContain('Document Heading');
    expect(useRichEditorCommandQueue.getState().pending).toEqual([
      {
        type: 'insertTable',
        rows: 3,
        cols: 3,
      },
    ]);
  });
});
