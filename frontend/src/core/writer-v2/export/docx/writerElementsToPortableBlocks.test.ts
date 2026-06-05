import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../../types';
import { writerElementsToPortableBlocks } from './writerElementsToPortableBlocks';

const DOCUMENT_FINGERPRINT = 'portable-block-test-document';

describe('writerElementsToPortableBlocks', () => {
  it('sorts by page, y descending, x ascending, zIndex, then createdAt and inserts page breaks', () => {
    const elements: WriterElementV2[] = [
      makeWriterElement({
        id: 'page-1-low',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 100, width: 200, height: 40 },
        plainText: 'Page 1 low',
      }),
      makeWriterElement({
        id: 'page-2-top',
        type: 'richTextBox',
        pageIndex: 1,
        rect: { x: 72, y: 700, width: 200, height: 40 },
        plainText: 'Page 2 top',
      }),
      makeWriterElement({
        id: 'page-1-top',
        type: 'richTextBox',
        pageIndex: 0,
        rect: { x: 72, y: 700, width: 200, height: 40 },
        plainText: 'Page 1 top',
      }),
    ];

    const result = writerElementsToPortableBlocks(elements);

    expect(result.fatal).toBe(false);
    expect(result.exportedElementCount).toBe(3);

    const textBlocks = result.blocks.filter((block) => block.type === 'paragraph');
    expect(textBlocks).toHaveLength(3);

    expect(textBlocks[0].type).toBe('paragraph');
    if (textBlocks[0].type === 'paragraph') {
      expect(textBlocks[0].children[0].text).toBe('Page 1 top');
    }

    expect(textBlocks[1].type).toBe('paragraph');
    if (textBlocks[1].type === 'paragraph') {
      expect(textBlocks[1].children[0].text).toBe('Page 1 low');
    }

    expect(result.blocks.some((block) => block.type === 'pageBreak')).toBe(true);

    expect(textBlocks[2].type).toBe('paragraph');
    if (textBlocks[2].type === 'paragraph') {
      expect(textBlocks[2].children[0].text).toBe('Page 2 top');
    }
  });

  it('skips hidden elements and exports locked elements', () => {
    const result = writerElementsToPortableBlocks([
      makeWriterElement({
        id: 'hidden',
        type: 'richTextBox',
        plainText: 'Hidden text',
        hidden: true,
      }),
      makeWriterElement({
        id: 'locked',
        type: 'richTextBox',
        plainText: 'Locked text',
        locked: true,
      }),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.exportedElementCount).toBe(1);
    expect(result.skippedHiddenElementCount).toBe(1);

    const paragraphs = result.blocks.filter((block) => block.type === 'paragraph');
    expect(paragraphs).toHaveLength(1);

    if (paragraphs[0].type === 'paragraph') {
      expect(paragraphs[0].children[0].text).toBe('Locked text');
    }
  });

  it('exports imageBox as image block when asset id is available', () => {
    const result = writerElementsToPortableBlocks([
      makeWriterElement({
        id: 'image',
        type: 'imageBox',
        imageAssetId: 'asset-1',
        rect: { x: 72, y: 500, width: 120, height: 80 },
      }),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('image');

    if (result.blocks[0].type === 'image') {
      expect(result.blocks[0].assetId).toBe('asset-1');
      expect(result.blocks[0].width).toBe(120);
      expect(result.blocks[0].height).toBe(80);
    }
  });

  it('falls back for invalid table data', () => {
    const result = writerElementsToPortableBlocks([
      makeWriterElement({
        id: 'bad-table',
        type: 'tableBox',
      }),
    ]);

    expect(result.fatal).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'INVALID_TABLE_DATA')).toBe(true);
    expect(result.blocks[0].type).toBe('paragraph');

    if (result.blocks[0].type === 'paragraph') {
      expect(result.blocks[0].children[0].text).toBe('[Invalid table]');
    }
  });
});

function makeWriterElement(
  overrides: Partial<WriterElementV2> & Pick<WriterElementV2, 'id' | 'type'>,
): WriterElementV2 {
  return {
    id: overrides.id,
    documentFingerprint: overrides.documentFingerprint ?? DOCUMENT_FINGERPRINT,
    pageIndex: overrides.pageIndex ?? 0,
    type: overrides.type,
    rect: overrides.rect ?? {
      x: 72,
      y: 720,
      width: 400,
      height: 80,
    },
    editorStateJson: overrides.editorStateJson,
    plainText: overrides.plainText,
    tableData: overrides.tableData,
    imageAssetId: overrides.imageAssetId,
    assetIds: overrides.assetIds,
    review: overrides.review,
    callout: overrides.callout,
    style: {
      zIndex: 0,
      fontSize: 11,
      fontFamily: 'Aptos',
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 8,
      opacity: 1,
      ...overrides.style,
    },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    locked: overrides.locked ?? false,
    hidden: overrides.hidden ?? false,
  };
}
