import {
  AlignmentType,
  Paragraph,
} from 'docx';
import type { PortableParagraphBlock, PortableTextAlignment } from './types';
import { renderInlineTextRuns } from './renderTextRuns';

export function renderParagraphBlock(block: PortableParagraphBlock): Paragraph {
  return new Paragraph({
    alignment: toDocxAlignment(block.alignment),
    indent: block.indent
      ? {
          left: block.indent * 360,
        }
      : undefined,
    spacing: {
      after: 120,
    },
    children: renderInlineTextRuns(block.children),
  });
}

export function toDocxAlignment(
  alignment: PortableTextAlignment | undefined,
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (alignment === 'center') return AlignmentType.CENTER;
  if (alignment === 'right') return AlignmentType.RIGHT;
  if (alignment === 'justify') return AlignmentType.JUSTIFIED;
  if (alignment === 'left') return AlignmentType.LEFT;
  return undefined;
}
