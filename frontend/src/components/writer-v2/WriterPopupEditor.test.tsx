import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createPlainTextEditorStateJson } from '@/core/writer-v2/editor/writerEditorState';
import { WriterPopupEditor } from './WriterPopupEditor';

function element(patch: Partial<WriterElementV2> = {}): WriterElementV2 {
  return {
    id: 'writer-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 200,
      height: 100,
    },
    editorStateJson: createPlainTextEditorStateJson('Hello writer'),
    plainText: 'Hello writer',
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

describe('WriterPopupEditor', () => {
  it('renders rich editor shell and toolbar', () => {
    render(
      <WriterPopupEditor
        element={element()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', {
      name: /edit writer element writer-1/i,
    })).toBeTruthy();

    expect(screen.getByRole('toolbar', {
      name: /writer editor toolbar/i,
    })).toBeTruthy();

    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /underline/i })).toBeTruthy();
  });

  it('saves serialized editor state and plain text', async () => {
    const onSave = vi.fn();

    render(
      <WriterPopupEditor
        element={element()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const payload = onSave.mock.calls[0][0];

    expect(payload.editorStateJson).toContain('"root"');
    expect(payload.plainText).toBe('Hello writer');
  });

  it('cancels without saving', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
      <WriterPopupEditor
        element={element()}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
