import { describe, expect, it } from 'vitest';
import { buildSelectBoxCopyFromTextItems } from './selectBoxCopyEngine';

const viewport = {
  pdfWidth: 612,
  pdfHeight: 792,
  scale: 1,
  rotation: 0 as const,
};

describe('select-box-copy formatting', () => {
  it('extracts only text inside rectangle and builds plain/html outputs', () => {
    const result = buildSelectBoxCopyFromTextItems({
      pageNumber: 1,
      viewport,
      viewportRect: {
        x: 0,
        y: 0,
        width: 120,
        height: 80,
      },
      textItems: [
        {
          id: 'a',
          text: 'Hello',
          x: 10,
          y: 10,
          width: 35,
          height: 10,
          fontSize: 10,
        },
        {
          id: 'b',
          text: 'World',
          x: 55,
          y: 10,
          width: 35,
          height: 10,
          fontSize: 10,
        },
        {
          id: 'outside',
          text: 'Outside',
          x: 400,
          y: 10,
          width: 40,
          height: 10,
          fontSize: 10,
        },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.plainText).toBe('Hello World');
    expect(result.html).toContain('<p>');
    expect(result.html).toContain('font-size:10px');
    expect(result.pdfRect.width).toBeGreaterThan(0);
  });
});