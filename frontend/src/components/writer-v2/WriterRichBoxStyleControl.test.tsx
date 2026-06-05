import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterRichBoxStyleControl } from './WriterRichBoxStyleControl';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function element(id: string): WriterElementV2 {
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
  };
}

describe('WriterRichBoxStyleControl', () => {
  beforeEach(async () => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('opens box style panel', () => {
    render(<WriterRichBoxStyleControl />);

    fireEvent.click(screen.getByLabelText('Writer box style'));

    expect(screen.getByLabelText('Writer rich box style panel')).toBeTruthy();
    expect(screen.getByLabelText('Writer box style preset')).toBeTruthy();
  });

  it('applies preset to selected rich box', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterRichBoxStyleControl />);

    fireEvent.click(screen.getByLabelText('Writer box style'));
    fireEvent.change(screen.getByLabelText('Writer box style preset'), {
      target: {
        value: 'engineeringNote',
      },
    });

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements[0].style.backgroundColor).toBe('#eff6ff');
    });

    expect(useWriterV2Store.getState().elements[0].style.borderColor).toBe('#2563eb');
  });

  it('updates padding from control', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterRichBoxStyleControl />);

    fireEvent.click(screen.getByLabelText('Writer box style'));
    fireEvent.change(screen.getByLabelText('Writer box padding'), {
      target: {
        value: '18',
      },
    });

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements[0].style.padding).toBe(18);
    });
  });

  it('exposes fit content action', () => {
    render(<WriterRichBoxStyleControl />);

    fireEvent.click(screen.getByLabelText('Writer box style'));

    expect(screen.getByRole('button', { name: 'Fit content height' })).toBeTruthy();
  });
});
