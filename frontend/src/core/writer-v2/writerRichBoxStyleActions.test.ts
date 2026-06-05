import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from './types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import {
  applyRichBoxStylePreset,
  getActiveRichBoxStyleTarget,
  patchActiveRichBoxStyle,
} from './writerRichBoxStyleActions';

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
    rect: { x: 10, y: 20, width: 180, height: 90 },
    plainText: 'Rich box',
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

describe('writerRichBoxStyleActions', () => {
  beforeEach(async () => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('patches selected rich box style', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    const result = await patchActiveRichBoxStyle({
      backgroundColor: '#eff6ff',
      borderColor: '#2563eb',
      padding: 14,
    });

    const updated = useWriterV2Store.getState().elements[0];

    expect(result.changed).toBe(true);
    expect(updated.style.backgroundColor).toBe('#eff6ff');
    expect(updated.style.borderColor).toBe('#2563eb');
    expect(updated.style.padding).toBe(14);
  });

  it('creates a rich box when no style target exists', async () => {
    const result = await patchActiveRichBoxStyle({
      backgroundColor: '#fff7ed',
    });

    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].style.backgroundColor).toBe('#fff7ed');
    expect(state.editingId).toBe(state.elements[0].id);
  });

  it('applies rich box style preset', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    const result = await applyRichBoxStylePreset('warningBox');
    const updated = useWriterV2Store.getState().elements[0];

    expect(result.changed).toBe(true);
    expect(updated.style.backgroundColor).toBe('#fef2f2');
    expect(updated.style.borderColor).toBe('#dc2626');
    expect(updated.style.borderWidth).toBe(2);
  });

  it('ignores locked selected box and creates editable fallback', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('locked-1', {
          locked: true,
        }),
      ],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'locked-1',
    });

    const targetBefore = getActiveRichBoxStyleTarget();
    expect(targetBefore).toBeNull();

    const result = await patchActiveRichBoxStyle({
      backgroundColor: '#ecfdf5',
    });

    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(2);
    expect(state.elements[1].style.backgroundColor).toBe('#ecfdf5');
  });
});
