import { describe, expect, it } from 'vitest';
import type { PdfBlock } from './richTextRenderer';
import { estimateRichContentMetrics } from './richContentMetrics';

describe('richContentMetrics', () => {
  it('estimates paragraph and heading content height', () => {
    const blocks: PdfBlock[] = [
      {
        type: 'heading',
        tag: 'h1',
        children: [{ text: 'Title', style: { bold: false, italic: false } }],
      },
      {
        type: 'paragraph',
        alignment: 'left',
        children: [{ text: 'A short paragraph.', style: { bold: false, italic: false } }],
      },
    ];

    const metrics = estimateRichContentMetrics(blocks, {
      fontSize: 11,
      availableWidth: 300,
      padding: 8,
    });

    expect(metrics.headingCount).toBe(1);
    expect(metrics.paragraphCount).toBe(1);
    expect(metrics.estimatedHeight).toBeGreaterThan(30);
  });

  it('counts images and tables', () => {
    const blocks: PdfBlock[] = [
      {
        type: 'image',
        src: 'data:image/png;base64,AA==',
        altText: 'Image',
        width: 100,
        height: 80,
      },
      {
        type: 'table',
        rows: [
          {
            cells: [
              {
                children: [
                  {
                    type: 'paragraph',
                    alignment: 'left',
                    children: [{ text: 'Cell', style: { bold: false, italic: false } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const metrics = estimateRichContentMetrics(blocks, {
      fontSize: 11,
      availableWidth: 300,
      padding: 8,
    });

    expect(metrics.imageCount).toBe(1);
    expect(metrics.tableCount).toBe(1);
    expect(metrics.estimatedHeight).toBeGreaterThan(100);
  });
});
