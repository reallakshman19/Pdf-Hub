import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useSessionStore } from '@/core/session/store';
import { useRichEditorCommandQueue } from './richEditorCommandQueue';
import { useWriterV2Store } from './writerV2Store';
import {
  insertImageFileIntoRichBox,
  insertRichTableIntoActiveBox,
} from './writerRichInsertActions';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function installImageStub() {
  class TestImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 1;
    naturalHeight = 1;
    width = 1;
    height = 1;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal('Image', TestImage);
}

describe('writerRichInsertActions', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    installImageStub();
    useRichEditorCommandQueue.getState().clear();
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('inserts table command into a newly opened rich box', async () => {
    const result = await insertRichTableIntoActiveBox(2, 4);
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.editingId).toBe(state.elements[0].id);
    expect(useRichEditorCommandQueue.getState().pending).toEqual([
      {
        type: 'insertTable',
        rows: 2,
        cols: 4,
      },
    ]);
  });

  it('clamps table dimensions', async () => {
    await insertRichTableIntoActiveBox(200, 100);

    expect(useRichEditorCommandQueue.getState().pending).toEqual([
      {
        type: 'insertTable',
        rows: 50,
        cols: 20,
      },
    ]);
  });

  it('inserts image command and stores asset', async () => {
    const bytes = Uint8Array.from(atob(ONE_BY_ONE_PNG), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'tiny.png', {
      type: 'image/png',
    });

    const result = await insertImageFileIntoRichBox(file);
    const state = useWriterV2Store.getState();
    const pending = useRichEditorCommandQueue.getState().pending;

    expect(result.changed).toBe(true);
    expect(state.assetRecords).toHaveLength(1);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: 'insertImage',
      altText: 'tiny.png',
      caption: 'tiny.png',
    });
  });

  it('rejects insert without PDF', async () => {
    useSessionStore.getState().clearDocument();

    const result = await insertRichTableIntoActiveBox(3, 3);

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/open a pdf/i);
    expect(useRichEditorCommandQueue.getState().pending).toEqual([]);
  });
});
