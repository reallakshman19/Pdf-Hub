import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from './types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from './writerV2Store';
import { consolidateCurrentPageLegacyWriterObjects } from './writerLegacyObjectConsolidation';

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return pdf.save();
}

function legacyElement(
  id: string,
  type: WriterElementV2['type'],
  plainText: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type,
    rect: { x: 72, y: 500 - Number(id.replace(/\D/g, '') || 0) * 40, width: 180, height: 40 },
    plainText,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      fontSize: 11,
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('writerLegacyObjectConsolidation', () => {
  beforeEach(async () => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: await samplePdf(),
      pageCount: 1,
    });
  });

  it('consolidates legacy text objects into one rich text box and hides originals', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        legacyElement('legacy-1', 'textStamp', 'REVIEWED'),
        legacyElement('legacy-2', 'reviewLabel', 'ENGINEERING REVIEW', {
          review: {
            status: 'open',
            priority: 'medium',
            category: 'engineering',
            commentId: 'comment-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        legacyElement('legacy-3', 'richNote', 'Note:'),
      ],
    });

    const result = await consolidateCurrentPageLegacyWriterObjects();
    const state = useWriterV2Store.getState();
    const rich = state.elements.find((element) => element.type === 'richTextBox');

    expect(result.changed).toBe(true);
    expect(result.convertedCount).toBe(3);
    expect(rich).toBeTruthy();
    expect(rich?.editorStateJson).toContain('REVIEWED');
    expect(rich?.editorStateJson).toContain('ENGINEERING REVIEW');
    expect(rich?.review?.category).toBe('engineering');
    expect(state.elements.filter((element) => element.id.startsWith('legacy-')).every((element) => element.hidden)).toBe(true);
    expect(state.editingId).toBe(rich?.id);
  });

  it('consolidates table data into rich table JSON', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        legacyElement('legacy-1', 'tableBox', 'Table', {
          tableData: {
            columns: [
              { id: 'col-1', label: 'A' },
              { id: 'col-2', label: 'B' },
            ],
            rows: [
              {
                id: 'row-1',
                cells: [
                  { id: 'cell-1', text: 'A1' },
                  { id: 'cell-2', text: 'B1' },
                ],
              },
            ],
          },
        }),
      ],
    });

    const result = await consolidateCurrentPageLegacyWriterObjects();
    const rich = useWriterV2Store.getState().elements.find((element) => element.type === 'richTextBox');

    expect(result.changed).toBe(true);
    expect(rich?.editorStateJson).toContain('"type":"table"');
    expect(rich?.editorStateJson).toContain('A1');
    expect(rich?.editorStateJson).toContain('B1');
  });

  it('returns unchanged when no legacy objects exist', async () => {
    const result = await consolidateCurrentPageLegacyWriterObjects();

    expect(result.changed).toBe(false);
    expect(result.convertedCount).toBe(0);
    expect(result.message).toMatch(/no legacy writer objects/i);
  });
});
