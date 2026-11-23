import type { OcrBlock, OcrTableBlock, OcrPageResult } from '../types';

export interface ReadingOrderSortOptions {
  /**
   * Minimum horizontal gap in points to be recognized as a column gutter.
   * Defaults to 12 points.
   */
  minColumnGutterPt?: number;
  /**
   * Vertical tolerance in points to treat two items on roughly the same horizontal baseline.
   * Defaults to 4 points.
   */
  verticalTolerancePt?: number;
  /**
   * Width ratio threshold relative to total page content width to classify a block as spanning
   * (e.g. headers, full-width banners, or footers across columns).
   * Defaults to 0.65 (65% of total content width).
   */
  spanningWidthRatio?: number;
}

interface SpatialItem {
  block: OcrBlock | OcrTableBlock;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/**
 * Normalizes an OCR block or table block into a spatial geometry item.
 */
function toSpatialItem(block: OcrBlock | OcrTableBlock): SpatialItem {
  const r = block.rect ?? block.bbox ?? { x: 0, y: 0, width: 0, height: 0 };
  const x = r.x ?? 0;
  const y = r.y ?? 0;
  const width = Math.max(0, r.width ?? 0);
  const height = Math.max(0, r.height ?? 0);
  return {
    block,
    x,
    y,
    width,
    height,
    right: x + width,
    bottom: y + height,
  };
}

/**
 * Sorts blocks within an OCR page into natural human reading order
 * using a hybrid spanning-band and recursive XY-Cut layout decomposition.
 * 
 * Accurately handles multi-column layouts (e.g. 2-column or 3-column documents,
 * side-by-side financial cards) so that Column 1 is completely read top-to-bottom
 * before moving to Column 2, while correctly preserving top headers, inline section
 * banners, and footers that span across column boundaries.
 */
export function sortOcrBlocksInReadingOrder(
  blocks: (OcrBlock | OcrTableBlock)[],
  options: ReadingOrderSortOptions = {},
): (OcrBlock | OcrTableBlock)[] {
  if (!blocks || blocks.length <= 1) {
    return blocks ? [...blocks] : [];
  }

  const items = blocks.map(toSpatialItem);
  const minGutter = Math.max(4, options.minColumnGutterPt ?? 12);
  const vTolerance = Math.max(1, options.verticalTolerancePt ?? 4);
  const spanningRatio = Math.max(0.4, Math.min(0.95, options.spanningWidthRatio ?? 0.65));

  const sortedItems = sortSpatialItems(items, minGutter, vTolerance, spanningRatio);
  return sortedItems.map((item) => item.block);
}

/**
 * Convenience helper to sort all blocks within an OcrPageResult in reading order.
 */
export function sortPageBlocksInReadingOrder(
  page: OcrPageResult,
  options: ReadingOrderSortOptions = {},
): OcrPageResult {
  if (!page.blocks || page.blocks.length <= 1) {
    return page;
  }

  return {
    ...page,
    blocks: sortOcrBlocksInReadingOrder(page.blocks, options),
  };
}

/**
 * High-level spatial sorting:
 * 1. Partitions items into horizontal bands separated by spanning blocks (headers/footers/banners).
 * 2. Recursively decomposes multi-column body bands into columns and rows.
 */
function sortSpatialItems(
  items: SpatialItem[],
  minGutter: number,
  vTolerance: number,
  spanningRatio: number,
): SpatialItem[] {
  if (items.length <= 1) return items;

  const minX = Math.min(...items.map((i) => i.x));
  const maxX = Math.max(...items.map((i) => i.right));
  const totalWidth = maxX - minX;

  if (totalWidth <= 0) {
    return [...items].sort((a, b) => a.y - b.y);
  }

  // Detect spanning blocks (items whose width covers >= spanningRatio of the total content width)
  const isSpanning = (item: SpatialItem) => item.width >= spanningRatio * totalWidth;
  const hasSpanningBlocks = items.some(isSpanning);

  if (!hasSpanningBlocks) {
    return recursiveXyCut(items, minGutter, vTolerance);
  }

  // Group into sequential vertical bands (spanning items vs multi-column clusters)
  const bands = partitionBySpanningBands(items, isSpanning, vTolerance);
  const result: SpatialItem[] = [];

  for (const band of bands) {
    if (band.length === 1 || band.every(isSpanning)) {
      result.push(...[...band].sort((a, b) => {
        if (Math.abs(a.y - b.y) > vTolerance) return a.y - b.y;
        return a.x - b.x;
      }));
    } else {
      result.push(...recursiveXyCut(band, minGutter, vTolerance));
    }
  }

  return result;
}

/**
 * Partitions items by Y position into alternating spanning bands and column bands.
 */
function partitionBySpanningBands(
  items: SpatialItem[],
  isSpanning: (item: SpatialItem) => boolean,
  vTolerance: number,
): SpatialItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const bands: SpatialItem[][] = [];
  let currentBand: SpatialItem[] = [];
  let currentIsSpanning: boolean | null = null;
  let bandBottom = 0;

  for (const item of sorted) {
    const spanning = isSpanning(item);

    if (currentBand.length === 0) {
      currentBand = [item];
      currentIsSpanning = spanning;
      bandBottom = item.bottom;
      continue;
    }

    // If transition from spanning to non-spanning or vice-versa, or significant vertical gap
    const typeChanged = spanning !== currentIsSpanning;
    const verticalGap = item.y > bandBottom + vTolerance;

    if (typeChanged || (currentIsSpanning && verticalGap)) {
      bands.push(currentBand);
      currentBand = [item];
      currentIsSpanning = spanning;
      bandBottom = item.bottom;
    } else {
      currentBand.push(item);
      if (item.bottom > bandBottom) {
        bandBottom = item.bottom;
      }
    }
  }

  if (currentBand.length > 0) {
    bands.push(currentBand);
  }

  return bands;
}

/**
 * Recursive XY-Cut for multi-column regions:
 * 1. Checks for vertical cuts (column gutters).
 * 2. If vertical cuts divide items into columns, sort each column top-to-bottom.
 * 3. If no vertical cuts, check horizontal cuts.
 * 4. Base case: sort by Y, then X.
 */
function recursiveXyCut(
  items: SpatialItem[],
  minGutter: number,
  vTolerance: number,
): SpatialItem[] {
  if (items.length <= 1) {
    return items;
  }

  // 1. Try vertical cut (column detection) first
  const verticalColumns = findVerticalPartitions(items, minGutter);
  if (verticalColumns.length > 1) {
    const result: SpatialItem[] = [];
    for (const col of verticalColumns) {
      result.push(...recursiveXyCut(col, minGutter, vTolerance));
    }
    return result;
  }

  // 2. If no vertical gutter divides all items, try horizontal cuts
  const horizontalSlices = findHorizontalPartitions(items, vTolerance);
  if (horizontalSlices.length > 1) {
    const result: SpatialItem[] = [];
    for (const slice of horizontalSlices) {
      result.push(...recursiveXyCut(slice, minGutter, vTolerance));
    }
    return result;
  }

  // 3. Base case: No further cuts possible. Sort by Y (top-to-bottom), then X (left-to-right).
  return [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > vTolerance) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });
}

/**
 * Finds horizontal whitespace cuts across all items.
 */
function findHorizontalPartitions(
  items: SpatialItem[],
  vTolerance: number,
): SpatialItem[][] {
  if (items.length <= 1) return [items];

  const sorted = [...items].sort((a, b) => a.y - b.y);
  const partitions: SpatialItem[][] = [];
  let currentPartition: SpatialItem[] = [sorted[0]];
  let maxBottom = sorted[0].bottom;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (item.y > maxBottom + vTolerance) {
      partitions.push(currentPartition);
      currentPartition = [item];
      maxBottom = item.bottom;
    } else {
      currentPartition.push(item);
      if (item.bottom > maxBottom) {
        maxBottom = item.bottom;
      }
    }
  }

  if (currentPartition.length > 0) {
    partitions.push(currentPartition);
  }

  return partitions;
}

/**
 * Finds vertical whitespace gutters across items.
 */
function findVerticalPartitions(
  items: SpatialItem[],
  minGutter: number,
): SpatialItem[][] {
  if (items.length <= 1) return [items];

  const sorted = [...items].sort((a, b) => a.x - b.x);
  const partitions: SpatialItem[][] = [];
  let currentPartition: SpatialItem[] = [sorted[0]];
  let maxRight = sorted[0].right;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (item.x >= maxRight + minGutter) {
      partitions.push(currentPartition);
      currentPartition = [item];
      maxRight = item.right;
    } else {
      currentPartition.push(item);
      if (item.right > maxRight) {
        maxRight = item.right;
      }
    }
  }

  if (currentPartition.length > 0) {
    partitions.push(currentPartition);
  }

  return partitions;
}
