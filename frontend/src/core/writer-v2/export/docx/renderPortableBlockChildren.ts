import type {
  Paragraph,
  Table,
} from 'docx';
import type { PortableExportBlock } from './types';
import { renderHeadingBlock } from './renderHeadingBlock';
import { renderListBlock } from './renderListBlock';
import { renderPageBreakBlock } from './renderPageBreakBlock';
import { renderParagraphBlock } from './renderParagraphBlock';
import { renderTableBlock } from './renderTableBlock';

export type SyncDocxBlockChild = Paragraph | Table;

/**
 * Synchronous renderer used inside table cells.
 *
 * Image blocks are intentionally skipped here because docx image rendering needs
 * async asset resolution. For first release, table-cell images are deferred.
 */
export function renderPortableBlockChildren(
  blocks: PortableExportBlock[],
): SyncDocxBlockChild[] {
  const children: SyncDocxBlockChild[] = [];

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      children.push(renderParagraphBlock(block));
    } else if (block.type === 'heading') {
      children.push(renderHeadingBlock(block));
    } else if (block.type === 'list') {
      children.push(...renderListBlock(block));
    } else if (block.type === 'table') {
      children.push(renderTableBlock(block));
    } else if (block.type === 'pageBreak') {
      children.push(renderPageBreakBlock());
    }
  }

  return children;
}
