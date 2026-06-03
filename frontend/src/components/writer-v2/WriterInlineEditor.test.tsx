import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createPlainTextEditorStateJson } from '@/core/writer-v2/editor/writerEditorState';
import { WriterInlineEditor } from './WriterInlineEditor';

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

describe('WriterInlineEditor', () => {
  it('renders content editable rich editor inline', () => {
    render(
      <WriterInlineEditor
        element={element()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', {
      name: /writer rich text inline editor/i,
    })).toBeTruthy();
  });

  it('triggers onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(
      <WriterInlineEditor
        element={element()}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saves when clicking outside or unmounting', async () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <WriterInlineEditor
        element={element()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    // The unmount-save is gated behind a setTimeout(0) guard (so StrictMode's
    // immediate dev-only remount doesn't save+close the editor). Let that guard
    // enable before unmounting, mirroring a real unmount after the editor has
    // been open.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Unmount triggers save
    unmount();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const payload = onSave.mock.calls[0][0];
    expect(payload.editorStateJson).toContain('"root"');
    expect(payload.plainText).toBe('Hello writer');
  });
});
