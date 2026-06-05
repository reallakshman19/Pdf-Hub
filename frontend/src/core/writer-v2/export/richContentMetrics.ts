import type { PdfBlock } from './richTextRenderer';

export interface RichContentMetricsOptions {
  fontSize: number;
  availableWidth: number;
  padding: number;
}

export interface RichContentMetrics {
  estimatedHeight: number;
  blockCount: number;
  tableCount: number;
  imageCount: number;
  paragraphCount: number;
  headingCount: number;
  listCount: number;
}

export function estimateRichContentMetrics(
  blocks: PdfBlock[],
  options: RichContentMetricsOptions,
): RichContentMetrics {
  const counters = {
    blockCount: 0,
    tableCount: 0,
    imageCount: 0,
    paragraphCount: 0,
    headingCount: 0,
    listCount: 0,
  };

  const estimatedHeight = estimateBlocksHeight(blocks, options, counters);

  return {
    estimatedHeight,
    ...counters,
  };
}

function estimateBlocksHeight(
  blocks: PdfBlock[],
  options: RichContentMetricsOptions,
  counters: Omit<RichContentMetrics, 'estimatedHeight'>,
): number {
  let height = 0;

  for (const block of blocks) {
    counters.blockCount += 1;

    if (block.type === 'heading') {
      counters.headingCount += 1;
      height += headingHeight(block.tag, options.fontSize);
      continue;
    }

    if (block.type === 'paragraph') {
      counters.paragraphCount += 1;
      height += paragraphHeight(block, options);
      continue;
    }

    if (block.type === 'list') {
      counters.listCount += 1;
      height += Math.max(1, block.items.length) * Math.max(16, options.fontSize * 1.55);
      continue;
    }

    if (block.type === 'image') {
      counters.imageCount += 1;
      const requestedHeight = typeof block.height === 'number' ? block.height : 120;
      height += Math.min(260, Math.max(48, requestedHeight)) + 10;
      if (block.caption) {
        height += 16;
      }
      continue;
    }

    if (block.type === 'table') {
      counters.tableCount += 1;
      height += estimateTableHeight(block, options, counters);
      continue;
    }
  }

  return height;
}

function headingHeight(
  tag: 'h1' | 'h2' | 'h3',
  fontSize: number,
): number {
  if (tag === 'h1') return Math.max(28, fontSize * 2.2);
  if (tag === 'h2') return Math.max(24, fontSize * 1.9);
  return Math.max(20, fontSize * 1.65);
}

function paragraphHeight(
  block: Extract<PdfBlock, { type: 'paragraph' }>,
  options: RichContentMetricsOptions,
): number {
  const text = block.children.map((child) => child.text).join('');
  const lineCount = estimateLineCount(text, options.availableWidth, options.fontSize);

  return Math.max(16, lineCount * options.fontSize * 1.45);
}

function estimateTableHeight(
  block: Extract<PdfBlock, { type: 'table' }>,
  options: RichContentMetricsOptions,
  counters: Omit<RichContentMetrics, 'estimatedHeight'>,
): number {
  const baseRowHeight = Math.max(24, options.fontSize * 2.2);
  let height = 0;

  for (const row of block.rows) {
    let rowHeight = baseRowHeight;

    for (const cell of row.cells) {
      const nestedHeight = estimateBlocksHeight(cell.children, options, counters);
      rowHeight = Math.max(rowHeight, nestedHeight + 10);
    }

    height += Math.min(90, rowHeight);
  }

  return height + 10;
}

function estimateLineCount(
  text: string,
  availableWidth: number,
  fontSize: number,
): number {
  const safeText = text.trim();
  if (!safeText) return 1;

  const averageCharWidth = Math.max(4, fontSize * 0.52);
  const charsPerLine = Math.max(12, Math.floor(availableWidth / averageCharWidth));

  return Math.max(1, Math.ceil(safeText.length / charsPerLine));
}
