import { Paragraph, TextRun } from 'docx';
import type { PortableListBlock } from './types';
import { renderInlineTextRuns } from './renderTextRuns';

export function renderListBlock(block: PortableListBlock): Paragraph[] {
  return block.items.map((item) => {
    const level = Math.max(0, Math.min(8, (item.indent ?? 1) - 1));

    if (block.listType === 'number') {
      return new Paragraph({
        numbering: {
          reference: 'writer-v2-numbering',
          level,
        },
        spacing: {
          after: 80,
        },
        children: renderInlineTextRuns(item.children),
      });
    }

    if (block.listType === 'check') {
      return new Paragraph({
        bullet: {
          level,
        },
        spacing: {
          after: 80,
        },
        children: [
          new TextRun(item.checked ? '☑ ' : '☐ '),
          ...renderInlineTextRuns(item.children),
        ],
      });
    }

    return new Paragraph({
      bullet: {
        level,
      },
      spacing: {
        after: 80,
      },
      children: renderInlineTextRuns(item.children),
    });
  });
}
