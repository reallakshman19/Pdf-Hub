import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildContentPagePdf } from './LayoutEngine';

async function expectSinglePagePdf(bytes: Uint8Array): Promise<void> {
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.length).toBeGreaterThan(100);

  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
}

describe('LayoutEngine professional blocks', () => {
  it('keeps old heading, paragraph, spacer, and table blocks compatible', async () => {
    const bytes = await buildContentPagePdf({
      size: 'a4',
      background: '#ffffff',
      blocks: [
        { type: 'heading', text: 'Old Heading' },
        { type: 'paragraph', text: 'Old paragraph text.' },
        { type: 'spacer', height: 12 },
        {
          type: 'table',
          rows: [
            ['Field', 'Value'],
            ['A', 'B'],
          ],
        },
      ],
    });

    await expectSinglePagePdf(bytes);
  });

  it('supports aligned heading and paragraph text', async () => {
    const bytes = await buildContentPagePdf({
      blocks: [
        { type: 'heading', text: 'Centered Title', align: 'center' },
        { type: 'paragraph', text: 'Right aligned text', align: 'right' },
        { type: 'text', text: 'Left aligned text', align: 'left' },
      ],
    });

    await expectSinglePagePdf(bytes);
  });

  it('renders separator, ordered list, unordered list, and signature line blocks', async () => {
    const bytes = await buildContentPagePdf({
      blocks: [
        { type: 'heading', text: 'Meeting Minutes' },
        { type: 'separator' },
        {
          type: 'list',
          ordered: true,
          items: ['Review agenda', 'Confirm actions'],
        },
        {
          type: 'list',
          items: ['Open item', 'Safety note'],
        },
        { type: 'signatureLine', label: 'Approved By' },
      ],
    });

    await expectSinglePagePdf(bytes);
  });

  it('supports relative table column widths', async () => {
    const bytes = await buildContentPagePdf({
      blocks: [
        {
          type: 'table',
          rows: [
            ['Item', 'Qty', 'Notes'],
            ['Pipe', '2', 'Carbon steel'],
          ],
          columnWidths: [2, 1, 3],
        },
      ],
    });

    await expectSinglePagePdf(bytes);
  });

  it('falls back safely for invalid table columnWidths', async () => {
    const bytes = await buildContentPagePdf({
      blocks: [
        {
          type: 'table',
          rows: [
            ['A', 'B', 'C'],
            ['1', '2', '3'],
          ],
          columnWidths: [1],
        },
      ],
    });

    await expectSinglePagePdf(bytes);
  });

  it('treats an empty list as safe no-op content', async () => {
    const bytes = await buildContentPagePdf({
      blocks: [
        { type: 'heading', text: 'Empty List Test' },
        { type: 'list', items: [] },
        { type: 'paragraph', text: 'After empty list.' },
      ],
    });

    await expectSinglePagePdf(bytes);
  });
});
