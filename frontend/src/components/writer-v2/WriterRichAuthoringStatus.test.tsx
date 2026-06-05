import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useActiveEditorStore } from '@/core/writer-v2/activeEditorStore';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterRichAuthoringStatus } from './WriterRichAuthoringStatus';

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
    rect: { x: 10, y: 20, width: 160, height: 80 },
    plainText: 'Existing rich box',
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

describe('WriterRichAuthoringStatus', () => {
  beforeEach(() => {
    useActiveEditorStore.getState().setActiveEditor(null);
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
  });

  it('shows unavailable state when no PDF is open', () => {
    render(<WriterRichAuthoringStatus />);

    expect(screen.getByText('Writer unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Writer Box' })).toBeDisabled();
  });

  it('creates a rich text box when Start Writer Box is clicked', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });

    render(<WriterRichAuthoringStatus />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Writer Box' }));

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements).toHaveLength(1);
    });

    const state = useWriterV2Store.getState();
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.editingId).toBe(state.elements[0].id);
  });

  it('opens selected rich text box instead of creating a new one', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterRichAuthoringStatus />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Writer Box' }));

    await waitFor(() => {
      expect(useWriterV2Store.getState().editingId).toBe('writer-1');
    });

    expect(useWriterV2Store.getState().elements).toHaveLength(1);
  });

  it('shows opening editor state when editingId exists but active editor is not registered yet', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().beginEditingWriterElement('writer-1');

    render(<WriterRichAuthoringStatus />);

    expect(screen.getByText('Opening editor')).toBeTruthy();
  });
});
