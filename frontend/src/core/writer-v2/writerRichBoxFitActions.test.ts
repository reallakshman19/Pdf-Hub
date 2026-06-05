import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from './types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import {
  fitActiveRichBoxToContent,
  fitRichBoxesToContentByIds,
} from './writerRichBoxFitActions';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function richElement(editorStateJson: string): WriterElementV2 {
  return {
    id: 'rich-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 72, y: 500, width: 420, height: 90 },
    plainText: 'Rich content',
    editorStateJson,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1,
      padding: 12,
      opacity: 1,
      fontSize: 11,
      fontFamily: 'Helvetica',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function stateWithParagraphs(count: number): string {
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: Array.from({ length: count }, (_, index) => ({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text: `Paragraph ${index + 1} with rich authoring content.`,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ],
      })),
    },
  });
}

describe('writerRichBoxFitActions', () => {
  beforeEach(async () => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('expands active rich box to fit estimated content', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [richElement(stateWithParagraphs(16))],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'rich-1',
    });

    const before = useWriterV2Store.getState().elements[0].rect;
    const result = await fitActiveRichBoxToContent();
    const after = useWriterV2Store.getState().elements[0].rect;

    expect(result.changed).toBe(true);
    expect(after.height).toBeGreaterThan(before.height);
    expect(after.y + after.height).toBeLessThanOrEqual(792);
  });

  it('creates a rich box when no target exists', async () => {
    const result = await fitActiveRichBoxToContent();
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
  });

  it('fits multiple rich boxes by id', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        {
          ...richElement(stateWithParagraphs(16)),
          id: 'rich-1',
        },
        {
          ...richElement(stateWithParagraphs(10)),
          id: 'rich-2',
          rect: { x: 72, y: 300, width: 420, height: 80 },
        },
      ],
    });

    const result = await fitRichBoxesToContentByIds(['rich-1', 'rich-2']);
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(result.fittedCount).toBe(2);
    expect(state.elements[0].rect.height).toBeGreaterThan(90);
    expect(state.elements[1].rect.height).toBeGreaterThan(80);
  });
});
