import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WriterInlineEditor } from './WriterInlineEditor';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createPlainTextEditorStateJson } from '@/core/writer-v2/editor/writerEditorState';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function element(): WriterElementV2 {
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
    editorStateJson: createPlainTextEditorStateJson(''),
    plainText: '',
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

function clipboardEvent(data: {
  html?: string;
  text?: string;
  files?: File[];
}): EventInit & {
  clipboardData: Pick<DataTransfer, 'getData' | 'files' | 'items'>;
} {
  return {
    clipboardData: {
      getData(type: string) {
        if (type === 'text/html') return data.html ?? '';
        if (type === 'text/plain') return data.text ?? '';
        return '';
      },
      files: (data.files ?? []) as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    },
  };
}

describe('WriterClipboardPlugin', () => {
  beforeEach(() => {
    useWriterV2Store.getState().hydrateWriterSession({ documentFingerprint: 'doc-1', elements: [element()] });
    useWriterV2Store.getState().beginEditingWriterElement('writer-1');
  });
  afterEach(() => { useWriterV2Store.getState().clearWriterV2(); });

  it('pastes plain text into the editor and saves it', async () => {
    const onSave = vi.fn();

    const { unmount } = render(
      <WriterInlineEditor
        element={element()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const editor = screen.getByLabelText('Writer rich text inline editor');

    fireEvent.paste(editor, clipboardEvent({
      text: 'Pasted plain text',
    }));

    await waitFor(
      () => {
        expect(editor.textContent).toContain('Pasted plain text');
      },
      { timeout: 2000 }
    );

    unmount();

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls.at(-1)?.[0].plainText).toContain('Pasted plain text');
  });

  it('captures pasted image assets and saves asset ids', async () => {
    const onSave = vi.fn();
    const bytes = Uint8Array.from(atob(ONE_BY_ONE_PNG), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'clip.png', { type: 'image/png' });
    // jsdom File may not implement the browser Blob.arrayBuffer API.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });

    const { unmount } = render(
      <WriterInlineEditor
        element={element()}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const editor = screen.getByLabelText('Writer rich text inline editor');

    fireEvent.paste(editor, clipboardEvent({
      files: [file],
    }));

    await waitFor(
      () => {
        expect(editor.querySelector('img')?.getAttribute('src')).toBe(`data:image/png;base64,${ONE_BY_ONE_PNG}`);
      },
      { timeout: 2000 }
    );

    unmount();

    expect(onSave).toHaveBeenCalled();

    const payload = onSave.mock.calls.at(-1)?.[0];

    expect(payload.assets).toHaveLength(1);
    expect(payload.assets[0].mimeType).toBe('image/png');
    expect(payload.editorStateJson).toContain('inline-image');
    expect(useWriterV2Store.getState().assetRecords).toHaveLength(0);
  });
});

