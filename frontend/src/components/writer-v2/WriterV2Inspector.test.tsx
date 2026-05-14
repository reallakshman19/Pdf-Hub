import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterV2Inspector } from './WriterV2Inspector';

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 140,
      height: 70,
    },
    plainText: 'Inspector test',
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

describe('WriterV2Inspector', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('shows empty state without selection', () => {
    render(<WriterV2Inspector />);

    expect(screen.getByText(/writer v2: no selection/i)).toBeTruthy();
  });

  it('shows selected writer element metadata', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    expect(screen.getByLabelText(/writer v2 inspector/i)).toBeTruthy();
    expect(screen.getByText(/richTextBox/i)).toBeTruthy();
  });

  it('duplicates selected writer element', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));

    expect(useWriterV2Store.getState().elements).toHaveLength(2);
  });

  it('locks and deletes selected writer element', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    fireEvent.click(screen.getByRole('button', { name: /^lock$/i }));

    expect(useWriterV2Store.getState().elements[0].locked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(useWriterV2Store.getState().elements).toHaveLength(0);
  });
});