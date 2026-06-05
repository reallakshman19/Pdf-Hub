import {
  HeadingLevel,
  Paragraph,
} from 'docx';
import type { PortableHeadingBlock } from './types';
import { renderInlineTextRuns } from './renderTextRuns';
import { toDocxAlignment } from './renderParagraphBlock';

export function renderHeadingBlock(block: PortableHeadingBlock): Paragraph {
  return new Paragraph({
    heading: toDocxHeading(block.tag),
    alignment: toDocxAlignment(block.alignment),
    spacing: {
      before: 160,
      after: 120,
    },
    children: renderInlineTextRuns(block.children),
  });
}

function toDocxHeading(tag: PortableHeadingBlock['tag']): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (tag === 'h1') return HeadingLevel.HEADING_1;
  if (tag === 'h2') return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}
